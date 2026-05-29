// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package tool

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	pathpkg "path"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ThinkInAIXYZ/go-mcp/protocol"
	cdpinput "github.com/chromedp/cdproto/input"
	"github.com/chromedp/chromedp"
	"github.com/chromedp/chromedp/kb"
	"golang.org/x/net/publicsuffix"
)

type browserUsePageInfo struct {
	URL   string
	Title string
}

type browserUseWebSkill struct {
	Domain      string `json:"domain"`
	PathPrefix  string `json:"pathPrefix"`
	Name        string `json:"name"`
	Skill       string `json:"skill"`
	UpdatedTime string `json:"updatedTime"`
}

type browserUseWebAction struct {
	SkillName   string `json:"skillName"`
	Name        string `json:"name"`
	Action      string `json:"action"`
	Script      string `json:"script"`
	UpdatedTime string `json:"updatedTime"`
}

type BrowserUseWebSkillData = browserUseWebSkill

type BrowserUseWebActionData = browserUseWebAction

var browserUseWebSkillStoreMu sync.RWMutex

var browserUseListWebSkillsFunc func(owner string) ([]BrowserUseWebSkillData, error)

var browserUseUpsertWebSkillFunc func(owner string, skill BrowserUseWebSkillData) (BrowserUseWebSkillData, error)

var browserUseDeleteWebSkillFunc func(owner, name string) (bool, int64, error)

var browserUseSkillExistsFunc func(owner, name string) (bool, error)

var browserUseListWebActionsFunc func(owner string) ([]BrowserUseWebActionData, error)

var browserUseListWebActionsBySkillNamesFunc func(owner string, skillNames []string) ([]BrowserUseWebActionData, error)

var browserUseUpsertWebActionFunc func(owner string, action BrowserUseWebActionData) (BrowserUseWebActionData, error)

var browserUseDeleteWebActionFunc func(owner, skillName, name string) (bool, error)

func SetBrowserUseWebSkillStore(
	list func(owner string) ([]BrowserUseWebSkillData, error),
	upsert func(owner string, skill BrowserUseWebSkillData) (BrowserUseWebSkillData, error),
	deleteSkill func(owner, name string) (bool, int64, error),
	exists ...func(owner, name string) (bool, error),
) {
	browserUseWebSkillStoreMu.Lock()
	defer browserUseWebSkillStoreMu.Unlock()

	browserUseListWebSkillsFunc = list
	browserUseUpsertWebSkillFunc = upsert
	browserUseDeleteWebSkillFunc = deleteSkill
	browserUseSkillExistsFunc = nil
	if len(exists) > 0 {
		browserUseSkillExistsFunc = exists[0]
	}
}

func SetBrowserUseWebActionStore(
	list func(owner string) ([]BrowserUseWebActionData, error),
	upsert func(owner string, action BrowserUseWebActionData) (BrowserUseWebActionData, error),
	deleteAction func(owner, skillName, name string) (bool, error),
	listBySkillNames ...func(owner string, skillNames []string) ([]BrowserUseWebActionData, error),
) {
	browserUseWebSkillStoreMu.Lock()
	defer browserUseWebSkillStoreMu.Unlock()

	browserUseListWebActionsFunc = list
	browserUseUpsertWebActionFunc = upsert
	browserUseDeleteWebActionFunc = deleteAction
	browserUseListWebActionsBySkillNamesFunc = nil
	if len(listBySkillNames) > 0 {
		browserUseListWebActionsBySkillNamesFunc = listBySkillNames[0]
	}
}

type browserUseWebActionTraceStep struct {
	ID          string `json:"step_id"`
	Sequence    int64  `json:"sequence"`
	Time        string `json:"time"`
	Summary     string `json:"summary"`
	Kind        string `json:"kind"`
	Selector    string `json:"selector,omitempty"`
	Target      string `json:"target,omitempty"`
	URL         string `json:"url,omitempty"`
	Text        string `json:"text,omitempty"`
	Clear       *bool  `json:"clear,omitempty"`
	Key         string `json:"key,omitempty"`
	URLBefore   string `json:"url_before,omitempty"`
	URLAfter    string `json:"url_after,omitempty"`
	TitleBefore string `json:"title_before,omitempty"`
	TitleAfter  string `json:"title_after,omitempty"`
	Outcome     string `json:"outcome,omitempty"`
	Status      string `json:"status"`
	Error       string `json:"error,omitempty"`
}

type browserUseWebActionScriptStep struct {
	Kind     string `json:"kind"`
	Selector string `json:"selector,omitempty"`
	URL      string `json:"url,omitempty"`
	Text     string `json:"text,omitempty"`
	Clear    *bool  `json:"clear,omitempty"`
	Key      string `json:"key,omitempty"`
	Summary  string `json:"summary,omitempty"`
}

type browserUseWebActionTraceState struct {
	NextSequence int64
	Steps        []browserUseWebActionTraceStep
}

var browserUseWebActionTraceMu sync.Mutex

var browserUseWebActionTraces = map[string]*browserUseWebActionTraceState{}

const browserUseWebActionTraceLimit = 200

const browserUseWebSkillReflectionPrompt = "After using this browser_use tool, reflect whether the site knowledge or successful workflow should be saved or updated: use browser_use_save_web_skill for reusable site knowledge, and inspect/save browser web actions when a repeatable workflow succeeded. The user does not need to explicitly ask for this; skip only one-off, uncertain, or failed workflows."

var browserUseWebActionPlaceholderPattern = regexp.MustCompile(`\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}`)

func browserUseWithWebSkillReflection(description string) string {
	return strings.TrimSpace(description) + " " + browserUseWebSkillReflectionPrompt
}

func browserUseDefaultOwner(owner string) string {
	owner = strings.TrimSpace(owner)
	if owner == "" {
		owner = "admin"
	}
	return owner
}

func browserUseRecordWebActionTrace(traceKey string, step browserUseWebActionTraceStep) browserUseWebActionTraceStep {
	traceKey = browserUseDefaultOwner(traceKey)
	browserUseWebActionTraceMu.Lock()
	defer browserUseWebActionTraceMu.Unlock()

	state := browserUseWebActionTraces[traceKey]
	if state == nil {
		state = &browserUseWebActionTraceState{}
		browserUseWebActionTraces[traceKey] = state
	}
	state.NextSequence++
	step.Sequence = state.NextSequence
	step.ID = fmt.Sprintf("bua_%06d", step.Sequence)
	if strings.TrimSpace(step.Time) == "" {
		step.Time = time.Now().UTC().Format(time.RFC3339)
	}
	if strings.TrimSpace(step.Status) == "" {
		step.Status = "success"
	}
	state.Steps = append(state.Steps, step)
	if len(state.Steps) > browserUseWebActionTraceLimit {
		state.Steps = state.Steps[len(state.Steps)-browserUseWebActionTraceLimit:]
	}
	return step
}

func browserUseTraceSteps(owner string) []browserUseWebActionTraceStep {
	owner = browserUseDefaultOwner(owner)
	browserUseWebActionTraceMu.Lock()
	defer browserUseWebActionTraceMu.Unlock()

	state := browserUseWebActionTraces[owner]
	if state == nil {
		return []browserUseWebActionTraceStep{}
	}
	steps := make([]browserUseWebActionTraceStep, len(state.Steps))
	copy(steps, state.Steps)
	return steps
}

func browserUseValidateWebActionScriptStep(actionName string, index int, step browserUseWebActionScriptStep) error {
	kind := strings.TrimSpace(step.Kind)
	switch kind {
	case "open":
		if strings.TrimSpace(step.URL) == "" {
			return fmt.Errorf("web action %q has invalid steps: step %d is an open step but has no url; save it again with an explicit parameterized steps array", actionName, index+1)
		}
	case "click":
		if strings.TrimSpace(step.Selector) == "" {
			return fmt.Errorf("web action %q has invalid steps: step %d is a click step but has no selector; save it again with an explicit parameterized steps array", actionName, index+1)
		}
	case "type":
		if strings.TrimSpace(step.Selector) == "" {
			return fmt.Errorf("web action %q has invalid steps: step %d is a type step but has no selector; save it again with an explicit parameterized steps array", actionName, index+1)
		}
	case "press":
		if strings.TrimSpace(step.Key) == "" {
			return fmt.Errorf("web action %q has invalid steps: step %d is a press step but has no key; save it again with an explicit parameterized steps array", actionName, index+1)
		}
	case "":
		return fmt.Errorf("web action %q is not executable: step %d is missing its action kind. Save it again with explicit parameterized steps, for example [{\"kind\":\"open\",\"url\":\"https://example.com/search?q={{query}}\"}, {\"kind\":\"click\",\"selector\":\"button[type=submit]\"}]", actionName, index+1)
	default:
		return fmt.Errorf("web action %q uses unsupported executable step kind %q at step %d. Supported kinds are open, click, type, and press. Save it again with explicit parameterized steps", actionName, kind, index+1)
	}
	return nil
}

func browserUseValidateWebActionScript(actionName string, steps []browserUseWebActionScriptStep) error {
	if len(steps) == 0 {
		return fmt.Errorf("web action %q is not executable because it has no steps. Save it again with an explicit parameterized steps array", actionName)
	}
	for i, step := range steps {
		if err := browserUseValidateWebActionScriptStep(actionName, i, step); err != nil {
			return err
		}
	}
	return nil
}

func browserUseTraceSummary(step browserUseWebActionTraceStep) string {
	parts := []string{fmt.Sprintf("%s: %s", step.ID, strings.TrimSpace(step.Summary))}
	if step.Kind != "" {
		parts = append(parts, "kind: "+step.Kind)
	}
	if step.Target != "" {
		parts = append(parts, "target: "+step.Target)
	} else if step.Selector != "" {
		parts = append(parts, "selector: "+step.Selector)
	}
	if step.URLBefore != "" || step.URLAfter != "" {
		parts = append(parts, fmt.Sprintf("transition: %s -> %s", step.URLBefore, step.URLAfter))
	}
	if step.TitleBefore != "" || step.TitleAfter != "" {
		parts = append(parts, fmt.Sprintf("title: %s -> %s", step.TitleBefore, step.TitleAfter))
	}
	if step.Outcome != "" {
		parts = append(parts, "outcome: "+step.Outcome)
	}
	if step.Error != "" {
		parts = append(parts, "error: "+step.Error)
	}
	return strings.Join(parts, " | ")
}

func browserUseWebActionVariableNames(action browserUseWebAction) []string {
	matches := browserUseWebActionPlaceholderPattern.FindAllStringSubmatch(action.Script, -1)
	seen := map[string]bool{}
	names := []string{}
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		name := strings.TrimSpace(match[1])
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func browserUseMissingWebActionVariables(action browserUseWebAction, variables map[string]string) []string {
	missing := []string{}
	for _, name := range browserUseWebActionVariableNames(action) {
		if _, ok := variables[name]; !ok {
			missing = append(missing, name)
		}
	}
	return missing
}

func browserUseValidateWebActionVariables(action browserUseWebAction, variables map[string]string) error {
	missing := browserUseMissingWebActionVariables(action, variables)
	if len(missing) == 0 {
		return nil
	}
	return fmt.Errorf("web action %q requires variables: %s. Pass them as {\"variables\":{%s}} when calling browser_use_run_web_action", action.Name, strings.Join(missing, ", "), browserUseFormatVariableExample(missing))
}

func browserUseFormatVariableExample(names []string) string {
	parts := make([]string, 0, len(names))
	for _, name := range names {
		parts = append(parts, fmt.Sprintf("%q:%q", name, "value"))
	}
	return strings.Join(parts, ",")
}

func browserUseWebSkillCatalogSummary(skill browserUseWebSkill) string {
	lines := strings.Split(strings.TrimSpace(skill.Skill), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(strings.TrimPrefix(line, "#"))
		if line != "" {
			return line
		}
	}
	return "Saved site experience."
}

func browserUsePageChanged(before, after browserUsePageInfo) bool {
	return strings.TrimSpace(before.URL) != strings.TrimSpace(after.URL) ||
		strings.TrimSpace(before.Title) != strings.TrimSpace(after.Title)
}

func browserUseTraceOutcome(kind string, before, after browserUsePageInfo) string {
	if browserUsePageChanged(before, after) {
		return "page changed"
	}
	switch strings.TrimSpace(kind) {
	case "open":
		return "navigation completed without an observed URL/title change"
	case "click":
		return "click completed; no URL/title change observed"
	case "type":
		return "text input completed; no URL/title change observed"
	case "press":
		return "key press completed; no URL/title change observed"
	default:
		return "completed; no URL/title change observed"
	}
}

func browserUseTraceTarget(arguments map[string]interface{}) (string, string) {
	if rawIndex, ok := arguments["index"]; ok {
		if index, err := browserUsePositiveInt(rawIndex, "index"); err == nil {
			return fmt.Sprintf("index=%d", index), fmt.Sprintf(`[data-openagent-browser-use-ref="%d"]`, index)
		}
	}
	if selector, ok := arguments["selector"].(string); ok && strings.TrimSpace(selector) != "" {
		selector = strings.TrimSpace(selector)
		return fmt.Sprintf("selector=%s", selector), selector
	}
	return "target=unknown", ""
}

func browserUseWebSkillOwner(provider *BrowserUseTool) string {
	if provider == nil {
		return ""
	}
	return strings.TrimSpace(provider.owner)
}

func browserUseTraceKey(provider *BrowserUseTool) string {
	if provider == nil {
		return browserUseWebSkillOwner(provider)
	}
	if strings.TrimSpace(provider.traceKey) != "" {
		return strings.TrimSpace(provider.traceKey)
	}
	return browserUseWebSkillOwner(provider)
}

func browserUseRecordProviderWebActionTrace(provider *BrowserUseTool, step browserUseWebActionTraceStep) browserUseWebActionTraceStep {
	return browserUseRecordWebActionTrace(browserUseTraceKey(provider), step)
}

func browserUseCurrentPageInfo(provider *BrowserUseTool) (browserUsePageInfo, error) {
	page := browserUsePageInfo{}
	err := provider.run(
		chromedp.Title(&page.Title),
		chromedp.Location(&page.URL),
	)
	return page, err
}

func browserUseCurrentPageInfoSafe(provider *BrowserUseTool) browserUsePageInfo {
	if provider == nil {
		return browserUsePageInfo{}
	}
	page, err := browserUseCurrentPageInfo(provider)
	if err != nil {
		return browserUsePageInfo{}
	}
	return page
}

func browserUseChromeExtCurrentPageInfo(ctx context.Context) (browserUsePageInfo, error) {
	state := browserUseChromeExtState{}
	if err := browserUseChromeExtCall(ctx, "state", map[string]interface{}{}, &state); err != nil {
		return browserUsePageInfo{}, err
	}
	return browserUsePageInfo{
		URL:   strings.TrimSpace(state.Tab.URL),
		Title: strings.TrimSpace(state.Tab.Title),
	}, nil
}

func browserUseChromeExtCurrentPageInfoSafe(ctx context.Context) browserUsePageInfo {
	page, err := browserUseChromeExtCurrentPageInfo(ctx)
	if err != nil {
		return browserUsePageInfo{}
	}
	return page
}

func browserUseNormalizeWebSkillPathPrefix(pathPrefix string) string {
	pathPrefix = strings.TrimSpace(pathPrefix)
	if pathPrefix == "" {
		return "/"
	}
	if !strings.HasPrefix(pathPrefix, "/") {
		pathPrefix = "/" + pathPrefix
	}
	if len(pathPrefix) > 1 {
		pathPrefix = strings.TrimRight(pathPrefix, "/")
	}
	if pathPrefix == "" {
		return "/"
	}
	return pathPrefix
}

func browserUseWebSkillPathMatches(path, prefix string) bool {
	path = browserUseNormalizeWebSkillPathPrefix(path)
	prefix = browserUseNormalizeWebSkillPathPrefix(prefix)
	if strings.Contains(prefix, "*") {
		matched, err := pathpkg.Match(prefix, path)
		return err == nil && matched
	}
	if prefix == "/" || path == prefix {
		return true
	}
	return strings.HasPrefix(path, prefix+"/") || strings.HasPrefix(path, prefix+"-")
}

func browserUseWebSkillDomainMatches(domain, pattern string) bool {
	domain = strings.ToLower(strings.TrimSpace(domain))
	pattern = strings.ToLower(strings.TrimSpace(pattern))
	if domain == "" || pattern == "" {
		return false
	}
	if !strings.Contains(pattern, "*") {
		return domain == pattern
	}
	matched, err := pathpkg.Match(pattern, domain)
	return err == nil && matched
}

func browserUseWebSkillSiteKey(domain string) string {
	domain = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(domain)), "*.")
	if domain == "" {
		return ""
	}
	siteKey, err := publicsuffix.EffectiveTLDPlusOne(domain)
	if err == nil {
		return siteKey
	}
	parts := strings.Split(domain, ".")
	if len(parts) >= 2 {
		return strings.Join(parts[len(parts)-2:], ".")
	}
	return domain
}

func browserUseWebSkillSiteMatches(domain, savedDomain string) bool {
	domainKey := browserUseWebSkillSiteKey(domain)
	savedKey := browserUseWebSkillSiteKey(savedDomain)
	return domainKey != "" && savedKey != "" && domainKey == savedKey
}

func browserUseNormalizeWebSkill(skill *browserUseWebSkill) {
	skill.Domain = strings.ToLower(strings.TrimSpace(skill.Domain))
	skill.PathPrefix = browserUseNormalizeWebSkillPathPrefix(skill.PathPrefix)
	skill.Name = strings.TrimSpace(skill.Name)
	skill.Skill = strings.TrimSpace(skill.Skill)
	skill.UpdatedTime = strings.TrimSpace(skill.UpdatedTime)
}

func browserUseResolveWebSkillBase(page browserUsePageInfo, explicitURL, explicitPathPrefix string) (string, string, string, error) {
	targetURL := strings.TrimSpace(explicitURL)
	if targetURL == "" {
		targetURL = strings.TrimSpace(page.URL)
	}
	if targetURL == "" {
		return "", "", "", fmt.Errorf("no current page URL is available; open a page first or pass url explicitly")
	}
	parsed, err := url.Parse(targetURL)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid url: %w", err)
	}
	domain := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	if domain == "" {
		return "", "", "", fmt.Errorf("could not derive domain from URL %q", targetURL)
	}
	pathPrefix := strings.TrimSpace(explicitPathPrefix)
	if pathPrefix == "" {
		pathPrefix = parsed.EscapedPath()
	}
	return targetURL, domain, browserUseNormalizeWebSkillPathPrefix(pathPrefix), nil
}

func browserUseLoadWebSkills(owner string) ([]browserUseWebSkill, error) {
	browserUseWebSkillStoreMu.RLock()
	list := browserUseListWebSkillsFunc
	browserUseWebSkillStoreMu.RUnlock()

	if list == nil {
		return []browserUseWebSkill{}, nil
	}
	skills, err := list(strings.TrimSpace(owner))
	if err != nil {
		return nil, err
	}
	for i := range skills {
		browserUseNormalizeWebSkill(&skills[i])
	}
	return skills, nil
}

func browserUseLoadWebActions(owner string) ([]browserUseWebAction, error) {
	browserUseWebSkillStoreMu.RLock()
	list := browserUseListWebActionsFunc
	browserUseWebSkillStoreMu.RUnlock()

	if list == nil {
		return []browserUseWebAction{}, nil
	}
	actions, err := list(strings.TrimSpace(owner))
	if err != nil {
		return nil, err
	}
	browserUseNormalizeWebActions(actions)
	return actions, nil
}

func browserUseNormalizeWebActions(actions []browserUseWebAction) {
	for i := range actions {
		actions[i].SkillName = strings.TrimSpace(actions[i].SkillName)
		actions[i].Name = strings.TrimSpace(actions[i].Name)
		actions[i].Action = strings.TrimSpace(actions[i].Action)
		actions[i].Script = strings.TrimSpace(actions[i].Script)
		actions[i].UpdatedTime = strings.TrimSpace(actions[i].UpdatedTime)
	}
}

func browserUseUniqueSkillNames(skills []browserUseWebSkill) []string {
	seen := map[string]bool{}
	names := []string{}
	for _, skill := range skills {
		name := strings.TrimSpace(skill.Name)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	return names
}

func browserUseLoadWebActionsBySkillNames(owner string, skillNames []string) ([]browserUseWebAction, error) {
	seen := map[string]bool{}
	names := []string{}
	for _, skillName := range skillNames {
		name := strings.TrimSpace(skillName)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	if len(names) == 0 {
		return []browserUseWebAction{}, nil
	}
	browserUseWebSkillStoreMu.RLock()
	listBySkillNames := browserUseListWebActionsBySkillNamesFunc
	browserUseWebSkillStoreMu.RUnlock()

	if listBySkillNames != nil {
		actions, err := listBySkillNames(strings.TrimSpace(owner), names)
		if err != nil {
			return nil, err
		}
		browserUseNormalizeWebActions(actions)
		return actions, nil
	}
	actions, err := browserUseLoadWebActions(owner)
	if err != nil {
		return nil, err
	}
	filtered := []browserUseWebAction{}
	for _, action := range actions {
		if seen[action.SkillName] {
			filtered = append(filtered, action)
		}
	}
	return filtered, nil
}

func browserUseActionsBySkill(owner string, skills []browserUseWebSkill) (map[string][]browserUseWebAction, error) {
	result := map[string][]browserUseWebAction{}
	if len(skills) == 0 {
		return result, nil
	}
	actions, err := browserUseLoadWebActionsBySkillNames(owner, browserUseUniqueSkillNames(skills))
	if err != nil {
		return nil, err
	}
	matchedSkillNames := map[string]bool{}
	for _, skill := range skills {
		matchedSkillNames[skill.Name] = true
	}
	for _, action := range actions {
		if matchedSkillNames[action.SkillName] {
			result[action.SkillName] = append(result[action.SkillName], action)
		}
	}
	for skillName := range result {
		sort.SliceStable(result[skillName], func(i, j int) bool {
			return result[skillName][i].UpdatedTime > result[skillName][j].UpdatedTime
		})
	}
	return result, nil
}

func browserUseMatchWebSkills(owner, rawURL string) ([]browserUseWebSkill, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return nil, err
	}
	domain := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	if domain == "" {
		return []browserUseWebSkill{}, nil
	}
	path := parsed.EscapedPath()
	if path == "" {
		path = "/"
	}

	skills, err := browserUseLoadWebSkills(owner)
	if err != nil {
		return nil, err
	}
	matched := []browserUseWebSkill{}
	for _, skill := range skills {
		domainMatches := browserUseWebSkillDomainMatches(domain, skill.Domain)
		siteMatches := browserUseWebSkillSiteMatches(domain, skill.Domain)
		if !domainMatches && !siteMatches {
			continue
		}
		// Site-level fuzzy matching means a skill saved from abc.example.com/path
		// is still useful on search.example.com/other-path.
		if domainMatches && !siteMatches && !browserUseWebSkillPathMatches(path, skill.PathPrefix) {
			continue
		}
		matched = append(matched, skill)
	}
	sort.SliceStable(matched, func(i, j int) bool {
		if len(matched[i].PathPrefix) != len(matched[j].PathPrefix) {
			return len(matched[i].PathPrefix) > len(matched[j].PathPrefix)
		}
		return matched[i].UpdatedTime > matched[j].UpdatedTime
	})
	return matched, nil
}

func browserUseFormatWebSkills(skills []browserUseWebSkill, actionsBySkill map[string][]browserUseWebAction) string {
	if len(skills) == 0 {
		return ""
	}
	var builder strings.Builder
	builder.WriteString("Browser Web Skills:\n")
	for _, skill := range skills {
		builder.WriteString(fmt.Sprintf("\n# %s\n", skill.Name))
		builder.WriteString(fmt.Sprintf("Scope: %s%s\n\n", skill.Domain, skill.PathPrefix))
		builder.WriteString(strings.TrimSpace(skill.Skill))
		builder.WriteString("\n")
		actions := actionsBySkill[skill.Name]
		if len(actions) > 0 {
			builder.WriteString("\n## Saved Web Actions\n")
			builder.WriteString("These actions are executable with `browser_use_run_web_action`.\n")
			for _, action := range actions {
				builder.WriteString(fmt.Sprintf("\n### %s\n", action.Name))
				variables := browserUseWebActionVariableNames(action)
				if len(variables) > 0 {
					builder.WriteString(fmt.Sprintf("Required variables: %s\n", strings.Join(variables, ", ")))
				}
				if strings.TrimSpace(action.Action) != "" {
					builder.WriteString(strings.TrimSpace(action.Action))
					builder.WriteString("\n")
				}
			}
		} else {
			builder.WriteString("\n## Saved Web Actions\n")
			builder.WriteString("No executable web actions are saved for this skill yet. Markdown scripts inside the skill are only notes; after a reusable workflow succeeds, save it with `browser_use_save_web_action` using explicit parameterized steps.\n")
		}
	}
	return strings.TrimSpace(builder.String())
}

func BrowserUseWebMemoryCatalog(owner string) (string, error) {
	skills, err := browserUseLoadWebSkills(owner)
	if err != nil {
		return "", err
	}
	if len(skills) == 0 {
		return "", nil
	}

	actionsBySkill, err := browserUseActionsBySkill(owner, skills)
	if err != nil {
		return "", err
	}

	var builder strings.Builder
	builder.WriteString("## Browser Web Memory Catalog\n")
	builder.WriteString("- Saved Browser Web Skills and Web Actions are indexed below as early browser-use context.\n")
	builder.WriteString("- When the user's task mentions one of these sites, consider using browser_use. Full site memory is injected after opening or snapshotting a matching URL.\n")
	builder.WriteString("- Use `browser_use_list_web_skills` after navigation when matching details are needed.\n\n")
	builder.WriteString("Saved site experience index:\n")
	for _, skill := range skills {
		parts := []string{fmt.Sprintf("- %s (%s%s)", skill.Name, skill.Domain, skill.PathPrefix)}
		summary := browserUseWebSkillCatalogSummary(skill)
		if summary != "" {
			parts = append(parts, "summary: "+summary)
		}
		actions := actionsBySkill[skill.Name]
		if len(actions) > 0 {
			actionParts := make([]string, 0, len(actions))
			for _, action := range actions {
				name := strings.TrimSpace(action.Name)
				if name == "" {
					continue
				}
				variables := browserUseWebActionVariableNames(action)
				if len(variables) > 0 {
					name += "(" + strings.Join(variables, ", ") + ")"
				}
				actionParts = append(actionParts, name)
			}
			if len(actionParts) > 0 {
				parts = append(parts, "actions: "+strings.Join(actionParts, ", "))
			}
		}
		items := strings.Join(parts, " | ")
		if len(items) > 500 {
			items = items[:500] + "..."
		}
		builder.WriteString(items)
		builder.WriteString("\n")
	}
	return strings.TrimSpace(builder.String()), nil
}

func browserUseSaveWebSkillFollowUp(saved browserUseWebSkill) string {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("Saved browser web skill %q for domain %q path_prefix=%q.", saved.Name, saved.Domain, saved.PathPrefix))
	builder.WriteString("\n\nNext memory step: if this site knowledge includes an explicit reusable workflow, save it separately as an executable web action with `browser_use_save_web_action`. Web-skill markdown is reference memory only; it is not runnable.")
	return builder.String()
}

func browserUseAugmentSnapshotWithWebSkills(owner, rawURL, snapshot string) (string, error) {
	skills, err := browserUseMatchWebSkills(owner, rawURL)
	if err != nil || len(skills) == 0 {
		return snapshot, err
	}
	actionsBySkill, err := browserUseActionsBySkill(owner, skills)
	if err != nil {
		return "", err
	}
	knowledge := browserUseFormatWebSkills(skills, actionsBySkill)
	if knowledge == "" {
		return snapshot, nil
	}
	const anchor = "\n\nInteractive elements:\n"
	if strings.Contains(snapshot, anchor) {
		return strings.Replace(snapshot, anchor, "\n\n"+knowledge+anchor, 1), nil
	}
	return snapshot + "\n\n" + knowledge, nil
}

func browserUseSaveWebSkillText(owner string, page browserUsePageInfo, arguments map[string]interface{}) (string, error) {
	rawURL, _ := arguments["url"].(string)
	rawPathPrefix, _ := arguments["path_prefix"].(string)
	_, domain, pathPrefix, err := browserUseResolveWebSkillBase(page, rawURL, rawPathPrefix)
	if err != nil {
		return "", err
	}
	name, _ := arguments["name"].(string)
	skillText, _ := arguments["skill"].(string)
	if strings.TrimSpace(name) == "" {
		return "", fmt.Errorf("name is required")
	}
	if strings.TrimSpace(skillText) == "" {
		return "", fmt.Errorf("skill is required")
	}
	skill := browserUseWebSkill{
		Domain:      domain,
		PathPrefix:  pathPrefix,
		Name:        name,
		Skill:       skillText,
		UpdatedTime: time.Now().UTC().Format(time.RFC3339),
	}
	browserUseNormalizeWebSkill(&skill)
	browserUseWebSkillStoreMu.RLock()
	upsert := browserUseUpsertWebSkillFunc
	browserUseWebSkillStoreMu.RUnlock()

	if upsert == nil {
		return "", fmt.Errorf("browser use web skill storage is not configured")
	}
	saved, err := upsert(strings.TrimSpace(owner), skill)
	if err != nil {
		return "", err
	}
	browserUseNormalizeWebSkill(&saved)
	return browserUseSaveWebSkillFollowUp(saved), nil
}

func browserUseListWebSkillsText(owner, rawURL string) (string, error) {
	if strings.TrimSpace(rawURL) == "" {
		return "", fmt.Errorf("missing URL")
	}
	skills, err := browserUseMatchWebSkills(owner, rawURL)
	if err != nil {
		return "", err
	}
	if len(skills) == 0 {
		return "No browser web skills matched the current URL.", nil
	}
	actionsBySkill, err := browserUseActionsBySkill(owner, skills)
	if err != nil {
		return "", err
	}
	return browserUseFormatWebSkills(skills, actionsBySkill), nil
}

func browserUseFormatWebActions(actions []browserUseWebAction) string {
	if len(actions) == 0 {
		return "No browser web actions matched."
	}
	sort.SliceStable(actions, func(i, j int) bool {
		if actions[i].SkillName != actions[j].SkillName {
			return actions[i].SkillName < actions[j].SkillName
		}
		return actions[i].Name < actions[j].Name
	})
	var builder strings.Builder
	builder.WriteString("Browser Web Actions:\n")
	for _, action := range actions {
		builder.WriteString(fmt.Sprintf("\n- %s / %s\n", action.SkillName, action.Name))
		variables := browserUseWebActionVariableNames(action)
		if len(variables) > 0 {
			builder.WriteString(fmt.Sprintf("  required variables: %s\n", strings.Join(variables, ", ")))
		} else {
			builder.WriteString("  required variables: none\n")
		}
		if strings.TrimSpace(action.Action) != "" {
			for _, line := range strings.Split(strings.TrimSpace(action.Action), "\n") {
				if strings.TrimSpace(line) != "" {
					builder.WriteString("  ")
					builder.WriteString(strings.TrimSpace(line))
					builder.WriteString("\n")
				}
			}
		}
	}
	return strings.TrimSpace(builder.String())
}

func browserUseListWebActionsText(owner string, arguments map[string]interface{}, defaultURL string) (string, error) {
	skillName, _ := arguments["skill_name"].(string)
	rawURL, _ := arguments["url"].(string)
	if strings.TrimSpace(rawURL) == "" {
		rawURL = strings.TrimSpace(defaultURL)
	}

	matchedSkillNames := map[string]bool{}
	if strings.TrimSpace(skillName) != "" {
		matchedSkillNames[strings.TrimSpace(skillName)] = true
	} else if strings.TrimSpace(rawURL) != "" {
		skills, err := browserUseMatchWebSkills(owner, rawURL)
		if err != nil {
			return "", err
		}
		for _, skill := range skills {
			matchedSkillNames[skill.Name] = true
		}
	}

	if len(matchedSkillNames) == 0 {
		if strings.TrimSpace(skillName) != "" || strings.TrimSpace(rawURL) != "" {
			return browserUseFormatWebActions([]browserUseWebAction{}), nil
		}
		actions, err := browserUseLoadWebActions(owner)
		if err != nil {
			return "", err
		}
		return browserUseFormatWebActions(actions), nil
	}

	skillNames := make([]string, 0, len(matchedSkillNames))
	for name := range matchedSkillNames {
		skillNames = append(skillNames, name)
	}
	actions, err := browserUseLoadWebActionsBySkillNames(owner, skillNames)
	if err != nil {
		return "", err
	}
	return browserUseFormatWebActions(actions), nil
}

func browserUseSkillExists(owner, skillName string) (bool, error) {
	skillName = strings.TrimSpace(skillName)
	if skillName == "" {
		return false, nil
	}
	browserUseWebSkillStoreMu.RLock()
	exists := browserUseSkillExistsFunc
	browserUseWebSkillStoreMu.RUnlock()

	if exists != nil {
		return exists(strings.TrimSpace(owner), skillName)
	}
	skills, err := browserUseLoadWebSkills(owner)
	if err != nil {
		return false, err
	}
	for _, skill := range skills {
		if skill.Name == skillName {
			return true, nil
		}
	}
	return false, nil
}

func browserUseActionStepsFromArguments(arguments map[string]interface{}) ([]browserUseWebActionScriptStep, error) {
	rawSteps, ok := arguments["steps"]
	if !ok {
		return nil, fmt.Errorf("steps is required; provide an explicit parameterized action sequence such as [{\"kind\":\"open\",\"url\":\"https://example.com/search?q={{query}}\"}, {\"kind\":\"click\",\"selector\":\"button[type=submit]\"}]")
	}
	bytes, err := json.Marshal(rawSteps)
	if err != nil {
		return nil, fmt.Errorf("steps must be a JSON array of action step objects: %w", err)
	}
	var steps []browserUseWebActionScriptStep
	if err = json.Unmarshal(bytes, &steps); err != nil {
		return nil, fmt.Errorf("steps must be a JSON array of action step objects: %w", err)
	}
	return steps, nil
}

func browserUseDescribeWebActionStep(step browserUseWebActionScriptStep) string {
	switch strings.TrimSpace(step.Kind) {
	case "open":
		return fmt.Sprintf("open %s", strings.TrimSpace(step.URL))
	case "click":
		return fmt.Sprintf("click %s", strings.TrimSpace(step.Selector))
	case "type":
		return fmt.Sprintf("type into %s", strings.TrimSpace(step.Selector))
	case "press":
		return fmt.Sprintf("press %s", strings.TrimSpace(step.Key))
	default:
		return strings.TrimSpace(step.Summary)
	}
}

func browserUseSaveWebActionText(owner string, arguments map[string]interface{}) (string, error) {
	browserUseWebSkillStoreMu.RLock()
	upsert := browserUseUpsertWebActionFunc
	browserUseWebSkillStoreMu.RUnlock()

	if upsert == nil {
		return "", fmt.Errorf("browser use web action storage is not configured")
	}
	skillName, _ := arguments["skill_name"].(string)
	name, _ := arguments["name"].(string)
	description, _ := arguments["description"].(string)
	actionText, _ := arguments["action"].(string)
	if strings.TrimSpace(skillName) == "" {
		return "", fmt.Errorf("skill_name is required")
	}
	if strings.TrimSpace(name) == "" {
		return "", fmt.Errorf("name is required")
	}
	exists, err := browserUseSkillExists(owner, skillName)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", fmt.Errorf("web skill %q was not found; save the web skill first", skillName)
	}

	scriptSteps, err := browserUseActionStepsFromArguments(arguments)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(actionText) == "" {
		var builder strings.Builder
		if strings.TrimSpace(description) != "" {
			builder.WriteString(strings.TrimSpace(description))
			builder.WriteString("\n\n")
		}
		builder.WriteString("## Steps\n")
		for i, step := range scriptSteps {
			builder.WriteString(fmt.Sprintf("%d. %s\n", i+1, browserUseDescribeWebActionStep(step)))
		}
		actionText = strings.TrimSpace(builder.String())
	}
	if err := browserUseValidateWebActionScript(strings.TrimSpace(name), scriptSteps); err != nil {
		return "", err
	}
	scriptBytes, err := json.Marshal(scriptSteps)
	if err != nil {
		return "", err
	}
	action := browserUseWebAction{
		SkillName:   strings.TrimSpace(skillName),
		Name:        strings.TrimSpace(name),
		Action:      strings.TrimSpace(actionText),
		Script:      string(scriptBytes),
		UpdatedTime: time.Now().UTC().Format(time.RFC3339),
	}
	saved, err := upsert(strings.TrimSpace(owner), action)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("Saved executable browser web action %q under web skill %q with %d step(s).", saved.Name, saved.SkillName, len(scriptSteps)), nil
}

func browserUseInspectWebActionTraceText(owner string, limit int) string {
	steps := browserUseTraceSteps(owner)
	if len(steps) == 0 {
		return "No browser web action trace steps recorded yet."
	}
	if limit <= 0 || limit > len(steps) {
		limit = len(steps)
	}
	steps = steps[len(steps)-limit:]
	var builder strings.Builder
	builder.WriteString("Browser web action trace:\n")
	for _, step := range steps {
		builder.WriteString("- ")
		builder.WriteString(browserUseTraceSummary(step))
		builder.WriteString("\n")
	}
	builder.WriteString("\nUse this trace only to review what happened. To save an action, write an explicit parameterized `steps` array for `browser_use_save_web_action`; do not pass trace step ids.")
	return strings.TrimSpace(builder.String())
}

func browserUseResolveWebAction(owner, skillName, name string) (browserUseWebAction, error) {
	actions, err := browserUseLoadWebActions(owner)
	if err != nil {
		return browserUseWebAction{}, err
	}
	skillName = strings.TrimSpace(skillName)
	name = strings.TrimSpace(name)
	if name == "" {
		return browserUseWebAction{}, fmt.Errorf("name is required")
	}
	matches := []browserUseWebAction{}
	for _, action := range actions {
		if action.Name != name {
			continue
		}
		if skillName != "" && action.SkillName != skillName {
			continue
		}
		matches = append(matches, action)
	}
	if len(matches) == 0 {
		if skillName != "" {
			return browserUseWebAction{}, fmt.Errorf("web action %q under web skill %q was not found", name, skillName)
		}
		return browserUseWebAction{}, fmt.Errorf("web action %q was not found", name)
	}
	if len(matches) > 1 {
		skillNames := make([]string, 0, len(matches))
		for _, action := range matches {
			skillNames = append(skillNames, action.SkillName)
		}
		sort.Strings(skillNames)
		return browserUseWebAction{}, fmt.Errorf("web action %q exists under multiple web skills (%s); pass skill_name to disambiguate", name, strings.Join(skillNames, ", "))
	}
	return matches[0], nil
}

func browserUseDeleteWebActionText(owner string, arguments map[string]interface{}) (string, error) {
	browserUseWebSkillStoreMu.RLock()
	deleteAction := browserUseDeleteWebActionFunc
	browserUseWebSkillStoreMu.RUnlock()

	if deleteAction == nil {
		return "", fmt.Errorf("browser use web action storage is not configured")
	}
	name, _ := arguments["name"].(string)
	skillName, _ := arguments["skill_name"].(string)
	action, err := browserUseResolveWebAction(owner, skillName, name)
	if err != nil {
		return "", err
	}
	deleted, err := deleteAction(strings.TrimSpace(owner), action.SkillName, action.Name)
	if err != nil {
		return "", err
	}
	if !deleted {
		return "", fmt.Errorf("web action %q under web skill %q was not found", action.Name, action.SkillName)
	}
	return fmt.Sprintf("Deleted browser web action %q under web skill %q.", action.Name, action.SkillName), nil
}

func browserUseDeleteWebSkillText(owner string, arguments map[string]interface{}) (string, error) {
	browserUseWebSkillStoreMu.RLock()
	deleteSkill := browserUseDeleteWebSkillFunc
	browserUseWebSkillStoreMu.RUnlock()

	if deleteSkill == nil {
		return "", fmt.Errorf("browser use web skill storage is not configured")
	}
	name, _ := arguments["name"].(string)
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("name is required")
	}
	deleted, deletedActions, err := deleteSkill(strings.TrimSpace(owner), name)
	if err != nil {
		return "", err
	}
	if !deleted {
		return "", fmt.Errorf("web skill %q was not found", name)
	}
	return fmt.Sprintf("Deleted browser web skill %q and %d associated web action(s).", name, deletedActions), nil
}

func browserUseVariables(arguments map[string]interface{}) map[string]string {
	variables := map[string]string{}
	rawVariables, ok := arguments["variables"].(map[string]interface{})
	if !ok {
		return variables
	}
	for key, value := range rawVariables {
		if text, ok := value.(string); ok {
			variables[strings.TrimSpace(key)] = text
		}
	}
	return variables
}

func browserUseApplyVariables(text string, variables map[string]string) string {
	return browserUseWebActionPlaceholderPattern.ReplaceAllStringFunc(text, func(match string) string {
		parts := browserUseWebActionPlaceholderPattern.FindStringSubmatch(match)
		if len(parts) < 2 {
			return match
		}
		key := strings.TrimSpace(parts[1])
		if value, ok := variables[key]; ok {
			return value
		}
		return match
	})
}

func browserUseDecodeWebActionScript(action browserUseWebAction) ([]browserUseWebActionScriptStep, error) {
	if strings.TrimSpace(action.Script) == "" {
		return nil, fmt.Errorf("web action %q is not executable because it has no structured steps. Save it again with browser_use_save_web_action using an explicit parameterized steps array", action.Name)
	}
	var steps []browserUseWebActionScriptStep
	if err := json.Unmarshal([]byte(action.Script), &steps); err != nil {
		return nil, fmt.Errorf("web action %q has a corrupted structured steps script and cannot run: %w. Save it again with browser_use_save_web_action using an explicit parameterized steps array", action.Name, err)
	}
	if err := browserUseValidateWebActionScript(action.Name, steps); err != nil {
		return nil, err
	}
	return steps, nil
}

func browserUseSelectorNeedsRefRefresh(selector string) bool {
	return strings.Contains(selector, "data-openagent-browser-use-ref")
}

func browserUseRefreshElementRefs(provider *BrowserUseTool, selector string) error {
	if !browserUseSelectorNeedsRefRefresh(selector) {
		return nil
	}
	var elements []browserUseElement
	return provider.run(chromedp.Evaluate(browserUseSnapshotScript(), &elements))
}

func browserUseChromeExtRefreshElementRefs(ctx context.Context, selector string) error {
	if !browserUseSelectorNeedsRefRefresh(selector) {
		return nil
	}
	var snapshot browserUseChromeExtSnapshotResult
	return browserUseChromeExtCall(ctx, "snapshot", map[string]interface{}{}, &snapshot)
}

func browserUseRunWebAction(provider *BrowserUseTool, action browserUseWebAction, variables map[string]string) error {
	steps, err := browserUseDecodeWebActionScript(action)
	if err != nil {
		return err
	}
	if err = browserUseValidateWebActionVariables(action, variables); err != nil {
		return err
	}
	for i, step := range steps {
		switch strings.TrimSpace(step.Kind) {
		case "open":
			rawURL := browserUseApplyVariables(step.URL, variables)
			if strings.TrimSpace(rawURL) == "" {
				return fmt.Errorf("step %d open is missing url", i+1)
			}
			if err = provider.run(chromedp.Navigate(rawURL), chromedp.WaitReady("body", chromedp.ByQuery)); err != nil {
				return fmt.Errorf("step %d open failed: %w", i+1, err)
			}
		case "click":
			selector := browserUseApplyVariables(step.Selector, variables)
			if strings.TrimSpace(selector) == "" {
				return fmt.Errorf("step %d click is missing selector", i+1)
			}
			if err = browserUseRefreshElementRefs(provider, selector); err != nil {
				return fmt.Errorf("step %d click could not refresh element refs: %w", i+1, err)
			}
			if err = provider.run(
				chromedp.ScrollIntoView(selector, chromedp.ByQuery),
				chromedp.Click(selector, chromedp.ByQuery),
				chromedp.Sleep(800*time.Millisecond),
			); err != nil {
				return fmt.Errorf("step %d click failed: %w", i+1, err)
			}
		case "type":
			selector := browserUseApplyVariables(step.Selector, variables)
			text := browserUseApplyVariables(step.Text, variables)
			clear := true
			if step.Clear != nil {
				clear = *step.Clear
			}
			if strings.TrimSpace(selector) == "" {
				return fmt.Errorf("step %d type is missing selector", i+1)
			}
			if err = browserUseRefreshElementRefs(provider, selector); err != nil {
				return fmt.Errorf("step %d type could not refresh element refs: %w", i+1, err)
			}
			actions := []chromedp.Action{
				chromedp.ScrollIntoView(selector, chromedp.ByQuery),
				chromedp.Click(selector, chromedp.ByQuery),
				chromedp.Sleep(100 * time.Millisecond),
			}
			if clear {
				actions = append(actions, chromedp.KeyEvent("a", chromedp.KeyModifiers(browserUseSelectAllModifier())), chromedp.KeyEvent(kb.Backspace))
			}
			actions = append(actions, cdpinput.InsertText(text), chromedp.Sleep(300*time.Millisecond))
			if err = provider.run(actions...); err != nil {
				return fmt.Errorf("step %d type failed: %w", i+1, err)
			}
		case "press":
			key := browserUseKey(browserUseApplyVariables(step.Key, variables))
			if strings.TrimSpace(key) == "" {
				return fmt.Errorf("step %d press is missing key", i+1)
			}
			if err = provider.run(chromedp.KeyEvent(key), chromedp.Sleep(800*time.Millisecond)); err != nil {
				return fmt.Errorf("step %d press failed: %w", i+1, err)
			}
		default:
			return browserUseValidateWebActionScriptStep(action.Name, i, step)
		}
	}
	return nil
}

func browserUseRunChromeExtWebAction(ctx context.Context, action browserUseWebAction, variables map[string]string) error {
	steps, err := browserUseDecodeWebActionScript(action)
	if err != nil {
		return err
	}
	if err = browserUseValidateWebActionVariables(action, variables); err != nil {
		return err
	}
	for i, step := range steps {
		switch strings.TrimSpace(step.Kind) {
		case "open":
			rawURL := browserUseApplyVariables(step.URL, variables)
			if strings.TrimSpace(rawURL) == "" {
				return fmt.Errorf("step %d open is missing url", i+1)
			}
			if err = browserUseChromeExtOpen(ctx, rawURL); err != nil {
				return fmt.Errorf("step %d open failed: %w", i+1, err)
			}
		case "click":
			selector := browserUseApplyVariables(step.Selector, variables)
			if strings.TrimSpace(selector) == "" {
				return fmt.Errorf("step %d click is missing selector", i+1)
			}
			if err = browserUseChromeExtRefreshElementRefs(ctx, selector); err != nil {
				return fmt.Errorf("step %d click could not refresh element refs: %w", i+1, err)
			}
			if err = browserUseChromeExtClick(ctx, map[string]interface{}{"selector": selector}); err != nil {
				return fmt.Errorf("step %d click failed: %w", i+1, err)
			}
		case "type":
			selector := browserUseApplyVariables(step.Selector, variables)
			text := browserUseApplyVariables(step.Text, variables)
			clear := true
			if step.Clear != nil {
				clear = *step.Clear
			}
			if strings.TrimSpace(selector) == "" {
				return fmt.Errorf("step %d type is missing selector", i+1)
			}
			if err = browserUseChromeExtRefreshElementRefs(ctx, selector); err != nil {
				return fmt.Errorf("step %d type could not refresh element refs: %w", i+1, err)
			}
			if err = browserUseChromeExtType(ctx, map[string]interface{}{"selector": selector, "text": text, "clear": clear}); err != nil {
				return fmt.Errorf("step %d type failed: %w", i+1, err)
			}
		case "press":
			key := browserUseApplyVariables(step.Key, variables)
			if strings.TrimSpace(key) == "" {
				return fmt.Errorf("step %d press is missing key", i+1)
			}
			if err = browserUseChromeExtPress(ctx, key); err != nil {
				return fmt.Errorf("step %d press failed: %w", i+1, err)
			}
		default:
			return browserUseValidateWebActionScriptStep(action.Name, i, step)
		}
	}
	return nil
}

func browserUseWebSkillSaveSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"url": map[string]interface{}{
				"type":        "string",
				"description": "Optional URL used to derive the skill domain. Defaults to the current controlled tab URL.",
			},
			"path_prefix": map[string]interface{}{
				"type":        "string",
				"description": "Optional URL path prefix for this web skill. Defaults to the current page path.",
			},
			"name": map[string]interface{}{
				"type":        "string",
				"description": "Short web skill name.",
			},
			"skill": map[string]interface{}{
				"type":        "string",
				"description": "Natural-language SKILL content. Include page notes, selectors, caveats, and optional script/action-chain sections as markdown.",
			},
		},
		"required": []string{"name", "skill"},
	}
}

func browserUseWebSkillListSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"url": map[string]interface{}{
				"type":        "string",
				"description": "Optional URL to match. Defaults to the current controlled tab URL.",
			},
		},
	}
}

func browserUseWebActionListSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"skill_name": map[string]interface{}{
				"type":        "string",
				"description": "Optional web skill name. If omitted, actions are listed for web skills matching the current page or provided URL.",
			},
			"url": map[string]interface{}{
				"type":        "string",
				"description": "Optional URL used to match web skills when skill_name is omitted. Defaults to the current controlled tab URL.",
			},
		},
	}
}

func browserUseWebActionSaveSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"skill_name": map[string]interface{}{
				"type":        "string",
				"description": "Name of the Browser Web Skill this executable action belongs to.",
			},
			"name": map[string]interface{}{
				"type":        "string",
				"description": "Short action name, for example search_posts.",
			},
			"steps": map[string]interface{}{
				"type":        "array",
				"description": "Explicit parameterized executable action sequence. Use browser_use_inspect_web_action_trace only to review prior attempts, then author these steps directly.",
				"items": map[string]interface{}{
					"type":                 "object",
					"additionalProperties": false,
					"properties": map[string]interface{}{
						"kind": map[string]interface{}{
							"type":        "string",
							"description": "Step kind: open, click, type, or press.",
							"enum":        []string{"open", "click", "type", "press"},
						},
						"url": map[string]interface{}{
							"type":        "string",
							"description": "URL for open steps. Supports {{variable}} placeholders.",
						},
						"selector": map[string]interface{}{
							"type":        "string",
							"description": "CSS selector for click/type steps. Supports {{variable}} placeholders.",
						},
						"text": map[string]interface{}{
							"type":        "string",
							"description": "Text for type steps. Supports {{variable}} placeholders.",
						},
						"clear": map[string]interface{}{
							"type":        "boolean",
							"description": "Whether type steps should clear existing text first.",
						},
						"key": map[string]interface{}{
							"type":        "string",
							"description": "Keyboard key for press steps.",
						},
						"summary": map[string]interface{}{
							"type":        "string",
							"description": "Optional human-readable note for this step.",
						},
					},
					"required": []string{"kind"},
				},
			},
			"description": map[string]interface{}{
				"type":        "string",
				"description": "Optional natural-language description for the action.",
			},
			"action": map[string]interface{}{
				"type":        "string",
				"description": "Optional markdown action notes. If omitted, notes are generated from steps.",
			},
		},
		"required": []string{"skill_name", "name", "steps"},
	}
}

func browserUseWebActionInspectTraceSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"limit": map[string]interface{}{
				"type":        "integer",
				"description": "Maximum number of recent trace steps to show.",
				"default":     50,
			},
		},
	}
}

func browserUseWebActionRunSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"skill_name": map[string]interface{}{
				"type":        "string",
				"description": "Optional web skill name used to disambiguate the action.",
			},
			"name": map[string]interface{}{
				"type":        "string",
				"description": "Saved web action name.",
			},
			"variables": map[string]interface{}{
				"type":        "object",
				"description": "Optional string replacements for {{variable}} placeholders in URLs, text, selectors, and keys.",
				"additionalProperties": map[string]interface{}{
					"type": "string",
				},
			},
		},
		"required": []string{"name"},
	}
}

func browserUseWebActionDeleteSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"skill_name": map[string]interface{}{
				"type":        "string",
				"description": "Optional web skill name used to disambiguate the action.",
			},
			"name": map[string]interface{}{
				"type":        "string",
				"description": "Saved web action name to delete.",
			},
		},
		"required": []string{"name"},
	}
}

func browserUseWebSkillDeleteSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"name": map[string]interface{}{
				"type":        "string",
				"description": "Browser Web Skill name to delete. Associated web actions are deleted too.",
			},
		},
		"required": []string{"name"},
	}
}

type browserUseSaveWebSkillBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseSaveWebSkillBuiltin) GetName() string { return "browser_use_save_web_skill" }

func (b *browserUseSaveWebSkillBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Save a lightweight natural-language Browser Web Skill for the current site. Use markdown SKILL content for site memory; save executable procedures separately with browser_use_save_web_action.")
}

func (b *browserUseSaveWebSkillBuiltin) GetInputSchema() interface{} {
	return browserUseWebSkillSaveSchema()
}

func (b *browserUseSaveWebSkillBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	page, err := browserUseCurrentPageInfo(b.provider)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use save web skill failed: %s", err.Error())), nil
	}
	text, err := browserUseSaveWebSkillText(browserUseWebSkillOwner(b.provider), page, arguments)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use save web skill failed: %s", err.Error())), nil
	}
	return browserUseTextWithState(b.provider, text), nil
}

type browserUseListWebSkillsBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseListWebSkillsBuiltin) GetName() string { return "browser_use_list_web_skills" }

func (b *browserUseListWebSkillsBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("List lightweight Browser Web Skills that match the current page or a provided URL.")
}

func (b *browserUseListWebSkillsBuiltin) GetInputSchema() interface{} {
	return browserUseWebSkillListSchema()
}

func (b *browserUseListWebSkillsBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	rawURL, _ := arguments["url"].(string)
	if strings.TrimSpace(rawURL) == "" {
		page, err := browserUseCurrentPageInfo(b.provider)
		if err != nil {
			return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use list web skills failed: %s", err.Error())), nil
		}
		rawURL = page.URL
	}
	text, err := browserUseListWebSkillsText(browserUseWebSkillOwner(b.provider), rawURL)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use list web skills failed: %s", err.Error())), nil
	}
	return browserUseTextWithState(b.provider, text), nil
}

type browserUseDeleteWebSkillBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseDeleteWebSkillBuiltin) GetName() string { return "browser_use_delete_web_skill" }

func (b *browserUseDeleteWebSkillBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Delete a Browser Web Skill by name. Associated executable web actions are deleted too.")
}

func (b *browserUseDeleteWebSkillBuiltin) GetInputSchema() interface{} {
	return browserUseWebSkillDeleteSchema()
}

func (b *browserUseDeleteWebSkillBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseDeleteWebSkillText(browserUseWebSkillOwner(b.provider), arguments)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use delete web skill failed: %s", err.Error())), nil
	}
	return browserUseTextWithState(b.provider, text), nil
}

type browserUseListWebActionsBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseListWebActionsBuiltin) GetName() string { return "browser_use_list_web_actions" }

func (b *browserUseListWebActionsBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("List executable Browser Web Actions, including required variables inferred from {{placeholders}} in the saved action script.")
}

func (b *browserUseListWebActionsBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionListSchema()
}

func (b *browserUseListWebActionsBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	rawURL, _ := arguments["url"].(string)
	if strings.TrimSpace(rawURL) == "" {
		page, err := browserUseCurrentPageInfo(b.provider)
		if err == nil {
			rawURL = page.URL
		}
	}
	text, err := browserUseListWebActionsText(browserUseWebSkillOwner(b.provider), arguments, rawURL)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use list web actions failed: %s", err.Error())), nil
	}
	return browserUseTextWithState(b.provider, text), nil
}

type browserUseInspectWebActionTraceBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseInspectWebActionTraceBuiltin) GetName() string {
	return "browser_use_inspect_web_action_trace"
}

func (b *browserUseInspectWebActionTraceBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Inspect recent Browser Use trace steps so the model can review prior attempts before authoring an explicit parameterized Browser Web Action steps array.")
}

func (b *browserUseInspectWebActionTraceBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionInspectTraceSchema()
}

func (b *browserUseInspectWebActionTraceBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	limit := 50
	if rawLimit, ok := arguments["limit"]; ok {
		if value, err := browserUsePositiveInt(rawLimit, "limit"); err == nil {
			limit = value
		}
	}
	return browserUseTextWithState(b.provider, browserUseInspectWebActionTraceText(browserUseTraceKey(b.provider), limit)), nil
}

type browserUseSaveWebActionBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseSaveWebActionBuiltin) GetName() string { return "browser_use_save_web_action" }

func (b *browserUseSaveWebActionBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Save an executable Browser Web Action associated with an existing Browser Web Skill. Provide an explicit parameterized steps array using open, click, type, and press steps; do not reference trace step ids.")
}

func (b *browserUseSaveWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionSaveSchema()
}

func (b *browserUseSaveWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseSaveWebActionText(browserUseWebSkillOwner(b.provider), arguments)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use save web action failed: %s", err.Error())), nil
	}
	return browserUseTextWithState(b.provider, text), nil
}

type browserUseRunWebActionBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseRunWebActionBuiltin) GetName() string { return "browser_use_run_web_action" }

func (b *browserUseRunWebActionBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Run a saved executable Browser Web Action. Use variables to fill {{placeholder}} values captured in the action script.")
}

func (b *browserUseRunWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionRunSchema()
}

func (b *browserUseRunWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	name, _ := arguments["name"].(string)
	skillName, _ := arguments["skill_name"].(string)
	action, err := browserUseResolveWebAction(browserUseWebSkillOwner(b.provider), skillName, name)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use run web action failed: %s", err.Error())), nil
	}
	if err = browserUseRunWebAction(b.provider, action, browserUseVariables(arguments)); err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use run web action failed: %s", err.Error())), nil
	}
	snapshot, err := browserUseSnapshot(b.provider)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use snapshot failed after running web action %s: %s", action.Name, err.Error())), nil
	}
	return browserUseTextWithState(b.provider, snapshot), nil
}

type browserUseDeleteWebActionBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseDeleteWebActionBuiltin) GetName() string { return "browser_use_delete_web_action" }

func (b *browserUseDeleteWebActionBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Delete a saved executable Browser Web Action. Pass skill_name when multiple web skills have an action with the same name.")
}

func (b *browserUseDeleteWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionDeleteSchema()
}

func (b *browserUseDeleteWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseDeleteWebActionText(browserUseWebSkillOwner(b.provider), arguments)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use delete web action failed: %s", err.Error())), nil
	}
	return browserUseTextWithState(b.provider, text), nil
}

type chromeConnectSaveWebSkillBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectSaveWebSkillBuiltin) GetName() string { return "browser_use_save_web_skill" }

func (b *chromeConnectSaveWebSkillBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Save a lightweight natural-language Browser Web Skill for the current controlled Chrome tab. Use browser_use_save_web_action for executable procedures.")
}

func (b *chromeConnectSaveWebSkillBuiltin) GetInputSchema() interface{} {
	return browserUseWebSkillSaveSchema()
}

func (b *chromeConnectSaveWebSkillBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	page, err := browserUseChromeExtCurrentPageInfo(ctx)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use save web skill failed: %s", err.Error())), nil
	}
	text, err := browserUseSaveWebSkillText(browserUseWebSkillOwner(b.provider), page, arguments)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use save web skill failed: %s", err.Error())), nil
	}
	return chromeConnectTextWithState(text), nil
}

type chromeConnectDeleteWebSkillBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectDeleteWebSkillBuiltin) GetName() string { return "browser_use_delete_web_skill" }

func (b *chromeConnectDeleteWebSkillBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Delete a Browser Web Skill by name. Associated executable web actions are deleted too.")
}

func (b *chromeConnectDeleteWebSkillBuiltin) GetInputSchema() interface{} {
	return browserUseWebSkillDeleteSchema()
}

func (b *chromeConnectDeleteWebSkillBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseDeleteWebSkillText(browserUseWebSkillOwner(b.provider), arguments)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use delete web skill failed: %s", err.Error())), nil
	}
	return chromeConnectTextWithState(text), nil
}

type chromeConnectListWebActionsBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectListWebActionsBuiltin) GetName() string { return "browser_use_list_web_actions" }

func (b *chromeConnectListWebActionsBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("List executable Browser Web Actions, including required variables inferred from {{placeholders}} in the saved action script.")
}

func (b *chromeConnectListWebActionsBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionListSchema()
}

func (b *chromeConnectListWebActionsBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	rawURL, _ := arguments["url"].(string)
	if strings.TrimSpace(rawURL) == "" {
		page, err := browserUseChromeExtCurrentPageInfo(ctx)
		if err == nil {
			rawURL = page.URL
		}
	}
	text, err := browserUseListWebActionsText(browserUseWebSkillOwner(b.provider), arguments, rawURL)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use list web actions failed: %s", err.Error())), nil
	}
	return chromeConnectTextWithState(text), nil
}

type chromeConnectInspectWebActionTraceBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectInspectWebActionTraceBuiltin) GetName() string {
	return "browser_use_inspect_web_action_trace"
}

func (b *chromeConnectInspectWebActionTraceBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Inspect recent Browser Use trace steps so the model can review prior attempts before authoring an explicit parameterized Browser Web Action steps array.")
}

func (b *chromeConnectInspectWebActionTraceBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionInspectTraceSchema()
}

func (b *chromeConnectInspectWebActionTraceBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	limit := 50
	if rawLimit, ok := arguments["limit"]; ok {
		if value, err := browserUsePositiveInt(rawLimit, "limit"); err == nil {
			limit = value
		}
	}
	return chromeConnectTextWithState(browserUseInspectWebActionTraceText(browserUseTraceKey(b.provider), limit)), nil
}

type chromeConnectSaveWebActionBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectSaveWebActionBuiltin) GetName() string { return "browser_use_save_web_action" }

func (b *chromeConnectSaveWebActionBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Save an executable Browser Web Action associated with an existing Browser Web Skill. Provide an explicit parameterized steps array using open, click, type, and press steps; do not reference trace step ids.")
}

func (b *chromeConnectSaveWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionSaveSchema()
}

func (b *chromeConnectSaveWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseSaveWebActionText(browserUseWebSkillOwner(b.provider), arguments)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use save web action failed: %s", err.Error())), nil
	}
	return chromeConnectTextWithState(text), nil
}

type chromeConnectRunWebActionBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectRunWebActionBuiltin) GetName() string { return "browser_use_run_web_action" }

func (b *chromeConnectRunWebActionBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Run a saved executable Browser Web Action via the OpenAgent Chrome extension.")
}

func (b *chromeConnectRunWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionRunSchema()
}

func (b *chromeConnectRunWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	name, _ := arguments["name"].(string)
	skillName, _ := arguments["skill_name"].(string)
	action, err := browserUseResolveWebAction(browserUseWebSkillOwner(b.provider), skillName, name)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use run web action failed: %s", err.Error())), nil
	}
	if err = browserUseRunChromeExtWebAction(ctx, action, browserUseVariables(arguments)); err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use run web action failed: %s", err.Error())), nil
	}
	snapshot, err := browserUseChromeExtSnapshot(b.provider, ctx)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use snapshot failed after running web action %s: %s", action.Name, err.Error())), nil
	}
	return chromeConnectTextWithState(snapshot), nil
}

type chromeConnectDeleteWebActionBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectDeleteWebActionBuiltin) GetName() string {
	return "browser_use_delete_web_action"
}

func (b *chromeConnectDeleteWebActionBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("Delete a saved executable Browser Web Action. Pass skill_name when multiple web skills have an action with the same name.")
}

func (b *chromeConnectDeleteWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionDeleteSchema()
}

func (b *chromeConnectDeleteWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseDeleteWebActionText(browserUseWebSkillOwner(b.provider), arguments)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use delete web action failed: %s", err.Error())), nil
	}
	return chromeConnectTextWithState(text), nil
}

type chromeConnectListWebSkillsBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectListWebSkillsBuiltin) GetName() string { return "browser_use_list_web_skills" }

func (b *chromeConnectListWebSkillsBuiltin) GetDescription() string {
	return browserUseWithWebSkillReflection("List lightweight Browser Web Skills that match the current controlled Chrome tab or a provided URL.")
}

func (b *chromeConnectListWebSkillsBuiltin) GetInputSchema() interface{} {
	return browserUseWebSkillListSchema()
}

func (b *chromeConnectListWebSkillsBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	rawURL, _ := arguments["url"].(string)
	if strings.TrimSpace(rawURL) == "" {
		page, err := browserUseChromeExtCurrentPageInfo(ctx)
		if err != nil {
			return chromeConnectErrorWithState(fmt.Sprintf("browser use list web skills failed: %s", err.Error())), nil
		}
		rawURL = page.URL
	}
	text, err := browserUseListWebSkillsText(browserUseWebSkillOwner(b.provider), rawURL)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use list web skills failed: %s", err.Error())), nil
	}
	return chromeConnectTextWithState(text), nil
}
