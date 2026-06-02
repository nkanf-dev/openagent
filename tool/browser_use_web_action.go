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
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ThinkInAIXYZ/go-mcp/protocol"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"golang.org/x/net/publicsuffix"
)

type browserUsePageInfo struct {
	URL   string
	Title string
}

type browserUseWebAction struct {
	ActionGroup string `json:"action_group"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	Action      string `json:"action"`
	Script      string `json:"script"`
	UpdatedTime string `json:"updatedTime"`
}

type BrowserUseWebActionData = browserUseWebAction

type BrowserUseWebActionFilter struct {
	ActionGroup string
	Name        string
	URL         string
}

var browserUseWebActionStoreMu sync.RWMutex

var browserUseListWebActionsFunc func(owner string) ([]BrowserUseWebActionData, error)

var browserUseListWebActionsByActionGroupsFunc func(owner string, actionGroups []string) ([]BrowserUseWebActionData, error)

var browserUseUpsertWebActionFunc func(owner string, action BrowserUseWebActionData) (BrowserUseWebActionData, error)

var browserUseDeleteWebActionFunc func(owner, actionGroup, name string) (bool, error)

func SetBrowserUseWebActionStore(
	list func(owner string) ([]BrowserUseWebActionData, error),
	upsert func(owner string, action BrowserUseWebActionData) (BrowserUseWebActionData, error),
	deleteAction func(owner, actionGroup, name string) (bool, error),
	listByActionGroups ...func(owner string, actionGroups []string) ([]BrowserUseWebActionData, error),
) {
	browserUseWebActionStoreMu.Lock()
	defer browserUseWebActionStoreMu.Unlock()

	browserUseListWebActionsFunc = list
	browserUseUpsertWebActionFunc = upsert
	browserUseDeleteWebActionFunc = deleteAction
	browserUseListWebActionsByActionGroupsFunc = nil
	if len(listByActionGroups) > 0 {
		browserUseListWebActionsByActionGroupsFunc = listByActionGroups[0]
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
	Kind           string   `json:"kind"`
	Selector       string   `json:"selector,omitempty"`
	SourceSelector string   `json:"sourceSelector,omitempty"`
	TargetSelector string   `json:"targetSelector,omitempty"`
	URL            string   `json:"url,omitempty"`
	Text           string   `json:"text,omitempty"`
	Clear          *bool    `json:"clear,omitempty"`
	Key            string   `json:"key,omitempty"`
	X              *float64 `json:"x,omitempty"`
	Y              *float64 `json:"y,omitempty"`
	Button         string   `json:"button,omitempty"`
	DoubleClick    bool     `json:"doubleClick,omitempty"`
	CtrlKey        bool     `json:"ctrlKey,omitempty"`
	ShiftKey       bool     `json:"shiftKey,omitempty"`
	AltKey         bool     `json:"altKey,omitempty"`
	MetaKey        bool     `json:"metaKey,omitempty"`
	Summary        string   `json:"summary,omitempty"`
}

type browserUseWebActionTraceState struct {
	NextSequence int64
	Steps        []browserUseWebActionTraceStep
}

var browserUseWebActionTraceMu sync.Mutex

var browserUseWebActionTraces = map[string]*browserUseWebActionTraceState{}

const browserUseWebActionTraceLimit = 200

const browserUseWebActionReflectionPrompt = "After using this browser_use tool, reflect whether a successful repeatable workflow should be saved or updated as a browser web action. Use browser_use_inspect_web_action_trace for review, then browser_use_save_web_action with an explicit parameterized steps array. The user does not need to explicitly ask for this; skip only one-off, uncertain, or failed workflows."

var browserUseWebActionPlaceholderPattern = regexp.MustCompile(`\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}`)

func browserUseWithWebActionReflection(description string) string {
	return strings.TrimSpace(description) + " " + browserUseWebActionReflectionPrompt
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
	kind := browserUseNormalizeWebActionStepKind(step.Kind)
	switch kind {
	case "open":
		if strings.TrimSpace(step.URL) == "" {
			return fmt.Errorf("web action %q has invalid steps: step %d is an open step but has no url; save it again with an explicit parameterized steps array", actionName, index+1)
		}
	case "click":
		if strings.TrimSpace(step.Selector) == "" && (step.X == nil || step.Y == nil) {
			return fmt.Errorf("web action %q has invalid steps: step %d is a click step but has no selector or viewport x/y coordinates; save it again with an explicit parameterized steps array", actionName, index+1)
		}
	case "type":
		if strings.TrimSpace(step.Selector) == "" && (step.X == nil || step.Y == nil) {
			return fmt.Errorf("web action %q has invalid steps: step %d is a type step but has no selector or viewport x/y coordinates; save it again with an explicit parameterized steps array", actionName, index+1)
		}
	case "press":
		if strings.TrimSpace(step.Key) == "" {
			return fmt.Errorf("web action %q has invalid steps: step %d is a press step but has no key; save it again with an explicit parameterized steps array", actionName, index+1)
		}
	case "drag_and_drop":
		if strings.TrimSpace(step.SourceSelector) == "" || strings.TrimSpace(step.TargetSelector) == "" {
			return fmt.Errorf("web action %q has invalid steps: step %d is a drag_and_drop step but has no sourceSelector or targetSelector; save it again with an explicit parameterized steps array", actionName, index+1)
		}
	case "":
		return fmt.Errorf("web action %q is not executable: step %d is missing its action kind. Save it again with explicit parameterized steps, for example [{\"kind\":\"open\",\"url\":\"https://example.com/search?q={{query}}\"}, {\"kind\":\"click\",\"selector\":\"button[type=submit]\"}]", actionName, index+1)
	default:
		return fmt.Errorf("web action %q uses unsupported executable step kind %q at step %d. Supported kinds are open, click, type, press, and drag_and_drop. Save it again with explicit parameterized steps", actionName, kind, index+1)
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

func browserUseNormalizeWebActionStepKind(kind string) string {
	switch strings.TrimSpace(kind) {
	case "navigate":
		return "open"
	case "dblclick":
		return "click"
	default:
		return strings.TrimSpace(kind)
	}
}

func browserUseNormalizeWebActionScriptStep(step browserUseWebActionScriptStep) browserUseWebActionScriptStep {
	originalKind := strings.TrimSpace(step.Kind)
	step.Kind = browserUseNormalizeWebActionStepKind(originalKind)
	if originalKind == "dblclick" {
		step.DoubleClick = true
	}
	step.Selector = strings.TrimSpace(step.Selector)
	step.SourceSelector = strings.TrimSpace(step.SourceSelector)
	step.TargetSelector = strings.TrimSpace(step.TargetSelector)
	step.URL = strings.TrimSpace(step.URL)
	step.Key = strings.TrimSpace(step.Key)
	step.Button = strings.TrimSpace(step.Button)
	step.Summary = strings.TrimSpace(step.Summary)
	return step
}

func browserUseNormalizeWebActionScriptSteps(steps []browserUseWebActionScriptStep) []browserUseWebActionScriptStep {
	normalized := make([]browserUseWebActionScriptStep, 0, len(steps))
	for _, step := range steps {
		normalized = append(normalized, browserUseNormalizeWebActionScriptStep(step))
	}
	return normalized
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
	matches := browserUseWebActionPlaceholderPattern.FindAllStringSubmatch(action.Script+"\n"+action.URL, -1)
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

func browserUseWebActionOwner(provider *BrowserUseTool) string {
	if provider == nil {
		return ""
	}
	return strings.TrimSpace(provider.owner)
}

func browserUseTraceKey(provider *BrowserUseTool) string {
	if provider == nil {
		return browserUseWebActionOwner(provider)
	}
	if strings.TrimSpace(provider.traceKey) != "" {
		return strings.TrimSpace(provider.traceKey)
	}
	return browserUseWebActionOwner(provider)
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

func browserUseLoadWebActions(owner string) ([]browserUseWebAction, error) {
	browserUseWebActionStoreMu.RLock()
	list := browserUseListWebActionsFunc
	browserUseWebActionStoreMu.RUnlock()

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
		actions[i].ActionGroup = strings.TrimSpace(actions[i].ActionGroup)
		actions[i].Name = strings.TrimSpace(actions[i].Name)
		actions[i].Action = strings.TrimSpace(actions[i].Action)
		actions[i].Script = strings.TrimSpace(actions[i].Script)
		actions[i].UpdatedTime = strings.TrimSpace(actions[i].UpdatedTime)
	}
}

func browserUseLoadWebActionsByActionGroups(owner string, actionGroups []string) ([]browserUseWebAction, error) {
	seen := map[string]bool{}
	names := []string{}
	for _, actionGroup := range actionGroups {
		name := strings.TrimSpace(actionGroup)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	if len(names) == 0 {
		return []browserUseWebAction{}, nil
	}
	browserUseWebActionStoreMu.RLock()
	listByActionGroups := browserUseListWebActionsByActionGroupsFunc
	browserUseWebActionStoreMu.RUnlock()

	if listByActionGroups != nil {
		actions, err := listByActionGroups(strings.TrimSpace(owner), names)
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
		if seen[action.ActionGroup] {
			filtered = append(filtered, action)
		}
	}
	return filtered, nil
}

func browserUseFormatWebActions(actions []browserUseWebAction) string {
	if len(actions) == 0 {
		return "No browser web actions matched."
	}
	sort.SliceStable(actions, func(i, j int) bool {
		if actions[i].ActionGroup != actions[j].ActionGroup {
			return actions[i].ActionGroup < actions[j].ActionGroup
		}
		return actions[i].Name < actions[j].Name
	})
	var builder strings.Builder
	builder.WriteString("Browser Web Actions:\n")
	for _, action := range actions {
		builder.WriteString(fmt.Sprintf("\n- %s / %s\n", action.ActionGroup, action.Name))
		variables := browserUseWebActionVariableNames(action)
		if len(variables) > 0 {
			builder.WriteString(fmt.Sprintf("  required variables: %s\n", strings.Join(variables, ", ")))
		} else {
			builder.WriteString("  required variables: none\n")
		}
		if strings.TrimSpace(action.URL) != "" {
			builder.WriteString(fmt.Sprintf("  start url: %s\n", strings.TrimSpace(action.URL)))
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
	actions, err := ListBrowserUseWebActions(owner, BrowserUseWebActionFilter{
		ActionGroup: browserUseActionGroupArgument(arguments),
		URL:         defaultURL,
	})
	if err != nil {
		return "", err
	}
	return browserUseFormatWebActions(actions), nil
}

func ListBrowserUseWebActions(owner string, filter BrowserUseWebActionFilter) ([]BrowserUseWebActionData, error) {
	actions, err := browserUseLoadWebActions(owner)
	if err != nil {
		return nil, err
	}

	filter.ActionGroup = strings.TrimSpace(filter.ActionGroup)
	filter.Name = strings.TrimSpace(filter.Name)
	filter.URL = strings.TrimSpace(filter.URL)

	filtered := make([]BrowserUseWebActionData, 0, len(actions))
	for _, action := range actions {
		if filter.ActionGroup != "" && action.ActionGroup != filter.ActionGroup {
			continue
		}
		if filter.Name != "" && action.Name != filter.Name {
			continue
		}
		if filter.URL != "" && !browserUseWebActionMatchesURL(action.URL, filter.URL) {
			continue
		}
		filtered = append(filtered, action)
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		if filtered[i].ActionGroup != filtered[j].ActionGroup {
			return filtered[i].ActionGroup < filtered[j].ActionGroup
		}
		return filtered[i].Name < filtered[j].Name
	})
	return filtered, nil
}

func GetBrowserUseWebAction(owner, actionGroup, name string) (BrowserUseWebActionData, error) {
	return browserUseResolveWebAction(owner, actionGroup, name)
}

func DeleteBrowserUseWebAction(owner, actionGroup, name string) (BrowserUseWebActionData, bool, error) {
	browserUseWebActionStoreMu.RLock()
	deleteAction := browserUseDeleteWebActionFunc
	browserUseWebActionStoreMu.RUnlock()

	if deleteAction == nil {
		return BrowserUseWebActionData{}, false, fmt.Errorf("browser use web action storage is not configured")
	}
	action, err := browserUseResolveWebAction(owner, actionGroup, name)
	if err != nil {
		return BrowserUseWebActionData{}, false, err
	}
	deleted, err := deleteAction(strings.TrimSpace(owner), action.ActionGroup, action.Name)
	if err != nil {
		return BrowserUseWebActionData{}, false, err
	}
	if !deleted {
		return BrowserUseWebActionData{}, false, fmt.Errorf("web action %q under action group %q was not found", action.Name, action.ActionGroup)
	}
	return action, true, nil
}

func browserUseWebActionMatchesURL(actionURL, currentURL string) bool {
	actionURL = strings.TrimSpace(actionURL)
	currentURL = strings.TrimSpace(currentURL)
	if actionURL == "" || currentURL == "" {
		return false
	}

	actionParsed, err := url.Parse(actionURL)
	if err != nil || actionParsed.Hostname() == "" {
		return false
	}
	currentParsed, err := url.Parse(currentURL)
	if err != nil || currentParsed.Hostname() == "" {
		return false
	}

	actionHost := strings.ToLower(strings.TrimPrefix(actionParsed.Hostname(), "www."))
	currentHost := strings.ToLower(strings.TrimPrefix(currentParsed.Hostname(), "www."))
	if actionHost == currentHost || strings.HasSuffix(currentHost, "."+actionHost) || strings.HasSuffix(actionHost, "."+currentHost) {
		return true
	}

	actionDomain, actionErr := publicsuffix.EffectiveTLDPlusOne(actionHost)
	currentDomain, currentErr := publicsuffix.EffectiveTLDPlusOne(currentHost)
	return actionErr == nil && currentErr == nil && actionDomain == currentDomain
}

func browserUseActionStepsFromArguments(arguments map[string]interface{}) ([]browserUseWebActionScriptStep, error) {
	rawSteps, ok := arguments["steps"]
	if !ok {
		rawScript, hasScript := arguments["script"]
		if !hasScript {
			return nil, fmt.Errorf("steps is required; provide an explicit parameterized action sequence such as [{\"kind\":\"open\",\"url\":\"https://example.com/search?q={{query}}\"}, {\"kind\":\"click\",\"selector\":\"button[type=submit]\"}]")
		}
		if script, ok := rawScript.(string); ok {
			var steps []browserUseWebActionScriptStep
			if err := json.Unmarshal([]byte(script), &steps); err != nil {
				return nil, fmt.Errorf("script must be a JSON array of action step objects: %w", err)
			}
			return browserUseNormalizeWebActionScriptSteps(steps), nil
		}
		rawSteps = rawScript
	}
	bytes, err := json.Marshal(rawSteps)
	if err != nil {
		return nil, fmt.Errorf("steps must be a JSON array of action step objects: %w", err)
	}
	var steps []browserUseWebActionScriptStep
	if err = json.Unmarshal(bytes, &steps); err != nil {
		return nil, fmt.Errorf("steps must be a JSON array of action step objects: %w", err)
	}
	return browserUseNormalizeWebActionScriptSteps(steps), nil
}

func browserUseNormalizeWebActionArguments(arguments map[string]interface{}) map[string]interface{} {
	normalized := map[string]interface{}{}
	for key, value := range arguments {
		normalized[key] = value
	}
	if _, ok := normalized["action_group"]; !ok {
		if value, ok := normalized["actionGroup"]; ok {
			normalized["action_group"] = value
		}
	}
	return normalized
}

func browserUseActionGroupArgument(arguments map[string]interface{}) string {
	arguments = browserUseNormalizeWebActionArguments(arguments)
	actionGroup, _ := arguments["action_group"].(string)
	return strings.TrimSpace(actionGroup)
}

func browserUseDescribeWebActionStep(step browserUseWebActionScriptStep) string {
	switch browserUseNormalizeWebActionStepKind(step.Kind) {
	case "open":
		return fmt.Sprintf("open %s", strings.TrimSpace(step.URL))
	case "click":
		if step.DoubleClick {
			return fmt.Sprintf("double click %s", browserUseDescribeWebActionTarget(step))
		}
		return fmt.Sprintf("click %s", browserUseDescribeWebActionTarget(step))
	case "type":
		return fmt.Sprintf("type into %s", browserUseDescribeWebActionTarget(step))
	case "press":
		return fmt.Sprintf("press %s", strings.TrimSpace(step.Key))
	case "drag_and_drop":
		return fmt.Sprintf("drag %s to %s", strings.TrimSpace(step.SourceSelector), strings.TrimSpace(step.TargetSelector))
	default:
		return strings.TrimSpace(step.Summary)
	}
}

func browserUseDescribeWebActionTarget(step browserUseWebActionScriptStep) string {
	if strings.TrimSpace(step.Selector) != "" {
		return strings.TrimSpace(step.Selector)
	}
	if step.X != nil && step.Y != nil {
		return fmt.Sprintf("viewport position %.0f,%.0f", *step.X, *step.Y)
	}
	return "target"
}

func SaveBrowserUseWebAction(owner string, arguments map[string]interface{}) (BrowserUseWebActionData, int, error) {
	arguments = browserUseNormalizeWebActionArguments(arguments)
	browserUseWebActionStoreMu.RLock()
	upsert := browserUseUpsertWebActionFunc
	browserUseWebActionStoreMu.RUnlock()

	if upsert == nil {
		return BrowserUseWebActionData{}, 0, fmt.Errorf("browser use web action storage is not configured")
	}
	actionGroup := browserUseActionGroupArgument(arguments)
	name, _ := arguments["name"].(string)
	description, _ := arguments["description"].(string)
	actionText, _ := arguments["action"].(string)
	startURL, _ := arguments["url"].(string)
	if strings.TrimSpace(actionGroup) == "" {
		return BrowserUseWebActionData{}, 0, fmt.Errorf("action_group is required")
	}
	if strings.TrimSpace(name) == "" {
		return BrowserUseWebActionData{}, 0, fmt.Errorf("name is required")
	}

	scriptSteps, err := browserUseActionStepsFromArguments(arguments)
	if err != nil {
		return BrowserUseWebActionData{}, 0, err
	}
	startURL = browserUseWebActionStartURL(startURL, scriptSteps)
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
		return BrowserUseWebActionData{}, 0, err
	}
	scriptBytes, err := json.Marshal(scriptSteps)
	if err != nil {
		return BrowserUseWebActionData{}, 0, err
	}
	action := browserUseWebAction{
		ActionGroup: strings.TrimSpace(actionGroup),
		Name:        strings.TrimSpace(name),
		URL:         strings.TrimSpace(startURL),
		Action:      strings.TrimSpace(actionText),
		Script:      string(scriptBytes),
		UpdatedTime: time.Now().UTC().Format(time.RFC3339),
	}
	saved, err := upsert(strings.TrimSpace(owner), action)
	if err != nil {
		return BrowserUseWebActionData{}, 0, err
	}
	return saved, len(scriptSteps), nil
}

func browserUseWebActionStartURL(rawURL string, steps []browserUseWebActionScriptStep) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL != "" {
		return rawURL
	}
	for _, step := range steps {
		if strings.TrimSpace(step.URL) != "" {
			return strings.TrimSpace(step.URL)
		}
	}
	return ""
}

func browserUseSaveWebActionText(owner string, arguments map[string]interface{}) (string, error) {
	saved, stepCount, err := SaveBrowserUseWebAction(owner, arguments)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("Saved executable browser web action %q under action group %q with %d step(s).", saved.Name, saved.ActionGroup, stepCount), nil
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

func browserUseResolveWebAction(owner, actionGroup, name string) (browserUseWebAction, error) {
	actions, err := browserUseLoadWebActions(owner)
	if err != nil {
		return browserUseWebAction{}, err
	}
	actionGroup = strings.TrimSpace(actionGroup)
	name = strings.TrimSpace(name)
	if name == "" {
		return browserUseWebAction{}, fmt.Errorf("name is required")
	}
	matches := []browserUseWebAction{}
	for _, action := range actions {
		if action.Name != name {
			continue
		}
		if actionGroup != "" && action.ActionGroup != actionGroup {
			continue
		}
		matches = append(matches, action)
	}
	if len(matches) == 0 {
		if actionGroup != "" {
			return browserUseWebAction{}, fmt.Errorf("web action %q under action group %q was not found", name, actionGroup)
		}
		return browserUseWebAction{}, fmt.Errorf("web action %q was not found", name)
	}
	if len(matches) > 1 {
		actionGroups := make([]string, 0, len(matches))
		for _, action := range matches {
			actionGroups = append(actionGroups, action.ActionGroup)
		}
		sort.Strings(actionGroups)
		return browserUseWebAction{}, fmt.Errorf("web action %q exists under multiple action groups (%s); pass action_group to disambiguate", name, strings.Join(actionGroups, ", "))
	}
	return matches[0], nil
}

func browserUseDeleteWebActionText(owner string, arguments map[string]interface{}) (string, error) {
	name, _ := arguments["name"].(string)
	actionGroup := browserUseActionGroupArgument(arguments)
	action, _, err := DeleteBrowserUseWebAction(owner, actionGroup, name)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("Deleted browser web action %q under action group %q.", action.Name, action.ActionGroup), nil
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
	steps = browserUseNormalizeWebActionScriptSteps(steps)
	if err := browserUseValidateWebActionScript(action.Name, steps); err != nil {
		return nil, err
	}
	return steps, nil
}

func browserUseNavigateWithoutLoadWait(rawURL string) chromedp.Action {
	return chromedp.ActionFunc(func(ctx context.Context) error {
		_, _, errorText, err := page.Navigate(rawURL).Do(ctx)
		if err != nil {
			return err
		}
		if errorText != "" {
			return fmt.Errorf("page load error %s", errorText)
		}
		return nil
	})
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
	if err = browserUseOpenWebActionStartURL(provider, action, steps, variables); err != nil {
		return err
	}
	for i, step := range steps {
		switch strings.TrimSpace(step.Kind) {
		case "open":
			rawURL := browserUseApplyVariables(step.URL, variables)
			if strings.TrimSpace(rawURL) == "" {
				return fmt.Errorf("step %d open is missing url", i+1)
			}
			if err = provider.run(browserUseNavigateWithoutLoadWait(rawURL), chromedp.WaitReady("body", chromedp.ByQuery)); err != nil {
				return fmt.Errorf("step %d open failed: %w", i+1, err)
			}
		case "click":
			selector := browserUseApplyVariables(step.Selector, variables)
			if strings.TrimSpace(selector) == "" {
				if step.X != nil && step.Y != nil {
					return fmt.Errorf("step %d click uses viewport coordinates, which are only supported in OpenAgent Chrome extension mode", i+1)
				}
				return fmt.Errorf("step %d click is missing selector", i+1)
			}
			if step.DoubleClick {
				return fmt.Errorf("step %d double click is only supported in OpenAgent Chrome extension mode", i+1)
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
				if step.X != nil && step.Y != nil {
					return fmt.Errorf("step %d type uses viewport coordinates, which are only supported in OpenAgent Chrome extension mode", i+1)
				}
				return fmt.Errorf("step %d type is missing selector", i+1)
			}
			if err = browserUseRefreshElementRefs(provider, selector); err != nil {
				return fmt.Errorf("step %d type could not refresh element refs: %w", i+1, err)
			}
			if err = provider.run(browserUseTypeActions(selector, text, clear)...); err != nil {
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
		case "drag_and_drop":
			return fmt.Errorf("step %d drag_and_drop is only supported in OpenAgent Chrome extension mode", i+1)
		default:
			return browserUseValidateWebActionScriptStep(action.Name, i, step)
		}
	}
	return nil
}

func browserUseOpenWebActionStartURL(provider *BrowserUseTool, action browserUseWebAction, steps []browserUseWebActionScriptStep, variables map[string]string) error {
	rawURL := browserUseApplyVariables(strings.TrimSpace(action.URL), variables)
	if strings.TrimSpace(rawURL) == "" || browserUseFirstStepIsOpen(steps) {
		return nil
	}
	if err := provider.run(browserUseNavigateWithoutLoadWait(rawURL), chromedp.WaitReady("body", chromedp.ByQuery)); err != nil {
		return fmt.Errorf("opening web action start url failed: %w", err)
	}
	return nil
}

func browserUseFirstStepIsOpen(steps []browserUseWebActionScriptStep) bool {
	if len(steps) == 0 {
		return false
	}
	return browserUseNormalizeWebActionStepKind(steps[0].Kind) == "open"
}

func browserUseChromeExtStepTargetPayload(step browserUseWebActionScriptStep, variables map[string]string) map[string]interface{} {
	payload := map[string]interface{}{}
	if selector := strings.TrimSpace(browserUseApplyVariables(step.Selector, variables)); selector != "" {
		payload["selector"] = selector
	}
	if step.X != nil {
		payload["x"] = *step.X
	}
	if step.Y != nil {
		payload["y"] = *step.Y
	}
	if button := strings.TrimSpace(browserUseApplyVariables(step.Button, variables)); button != "" {
		payload["button"] = button
	}
	if step.CtrlKey {
		payload["ctrlKey"] = true
	}
	if step.ShiftKey {
		payload["shiftKey"] = true
	}
	if step.AltKey {
		payload["altKey"] = true
	}
	if step.MetaKey {
		payload["metaKey"] = true
	}
	if step.DoubleClick {
		payload["doubleClick"] = true
	}
	return payload
}

func browserUseRunChromeExtWebAction(ctx context.Context, action browserUseWebAction, variables map[string]string) error {
	steps, err := browserUseDecodeWebActionScript(action)
	if err != nil {
		return err
	}
	if err = browserUseValidateWebActionVariables(action, variables); err != nil {
		return err
	}
	if err = browserUseChromeExtOpenWebActionStartURL(ctx, action, steps, variables); err != nil {
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
			payload := browserUseChromeExtStepTargetPayload(step, variables)
			selector, _ := payload["selector"].(string)
			if strings.TrimSpace(selector) == "" && (payload["x"] == nil || payload["y"] == nil) {
				return fmt.Errorf("step %d click is missing selector or viewport x/y coordinates", i+1)
			}
			if err = browserUseChromeExtRefreshElementRefs(ctx, selector); err != nil {
				return fmt.Errorf("step %d click could not refresh element refs: %w", i+1, err)
			}
			if err = browserUseChromeExtCall(ctx, "click", payload, nil); err != nil {
				return fmt.Errorf("step %d click failed: %w", i+1, err)
			}
		case "type":
			payload := browserUseChromeExtStepTargetPayload(step, variables)
			selector, _ := payload["selector"].(string)
			text := browserUseApplyVariables(step.Text, variables)
			clear := true
			if step.Clear != nil {
				clear = *step.Clear
			}
			if strings.TrimSpace(selector) == "" && (payload["x"] == nil || payload["y"] == nil) {
				return fmt.Errorf("step %d type is missing selector or viewport x/y coordinates", i+1)
			}
			if err = browserUseChromeExtRefreshElementRefs(ctx, selector); err != nil {
				return fmt.Errorf("step %d type could not refresh element refs: %w", i+1, err)
			}
			payload["text"] = text
			payload["clear"] = clear
			if err = browserUseChromeExtCall(ctx, "type", payload, nil); err != nil {
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
		case "drag_and_drop":
			sourceSelector := strings.TrimSpace(browserUseApplyVariables(step.SourceSelector, variables))
			targetSelector := strings.TrimSpace(browserUseApplyVariables(step.TargetSelector, variables))
			if sourceSelector == "" || targetSelector == "" {
				return fmt.Errorf("step %d drag_and_drop is missing sourceSelector or targetSelector", i+1)
			}
			if err = browserUseChromeExtCall(ctx, "dragAndDrop", map[string]interface{}{
				"sourceSelector": sourceSelector,
				"targetSelector": targetSelector,
			}, nil); err != nil {
				return fmt.Errorf("step %d drag_and_drop failed: %w", i+1, err)
			}
		default:
			return browserUseValidateWebActionScriptStep(action.Name, i, step)
		}
	}
	return nil
}

func browserUseChromeExtOpenWebActionStartURL(ctx context.Context, action browserUseWebAction, steps []browserUseWebActionScriptStep, variables map[string]string) error {
	rawURL := browserUseApplyVariables(strings.TrimSpace(action.URL), variables)
	if strings.TrimSpace(rawURL) == "" || browserUseFirstStepIsOpen(steps) {
		return nil
	}
	if err := browserUseChromeExtOpen(ctx, rawURL); err != nil {
		return fmt.Errorf("opening web action start url failed: %w", err)
	}
	return nil
}

func browserUseWebActionListSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"action_group": map[string]interface{}{
				"type":        "string",
				"description": "Optional action group name. If omitted, all saved actions are listed.",
			},
		},
	}
}

func browserUseWebActionSaveSchema() interface{} {
	return map[string]interface{}{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]interface{}{
			"action_group": map[string]interface{}{
				"type":        "string",
				"description": "Action group name used to organize and disambiguate saved web actions.",
			},
			"name": map[string]interface{}{
				"type":        "string",
				"description": "Short action name, for example search_posts.",
			},
			"url": map[string]interface{}{
				"type":        "string",
				"description": "Optional start URL for the action. If present and the first step is not open, run_web_action opens this URL before replaying steps. Supports {{variable}} placeholders.",
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
							"description": "Step kind: open, click, type, press, or drag_and_drop. Recorder aliases navigate and dblclick are accepted and normalized.",
							"enum":        []string{"open", "click", "type", "press", "drag_and_drop", "navigate", "dblclick"},
						},
						"url": map[string]interface{}{
							"type":        "string",
							"description": "URL for open steps. Supports {{variable}} placeholders.",
						},
						"selector": map[string]interface{}{
							"type":        "string",
							"description": "CSS selector for click/type steps. Supports {{variable}} placeholders.",
						},
						"sourceSelector": map[string]interface{}{
							"type":        "string",
							"description": "CSS selector for drag_and_drop source. Supports {{variable}} placeholders.",
						},
						"targetSelector": map[string]interface{}{
							"type":        "string",
							"description": "CSS selector for drag_and_drop target. Supports {{variable}} placeholders.",
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
						"x": map[string]interface{}{
							"type":        "number",
							"description": "Optional viewport x coordinate fallback for click/type steps recorded by the Chrome extension.",
						},
						"y": map[string]interface{}{
							"type":        "number",
							"description": "Optional viewport y coordinate fallback for click/type steps recorded by the Chrome extension.",
						},
						"button": map[string]interface{}{
							"type":        "string",
							"description": "Optional mouse button for click steps.",
							"enum":        []string{"left", "middle", "right"},
						},
						"doubleClick": map[string]interface{}{
							"type":        "boolean",
							"description": "Whether a click step should dispatch a double click.",
						},
						"ctrlKey":  map[string]interface{}{"type": "boolean"},
						"shiftKey": map[string]interface{}{"type": "boolean"},
						"altKey":   map[string]interface{}{"type": "boolean"},
						"metaKey":  map[string]interface{}{"type": "boolean"},
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
		"required": []string{"action_group", "name", "steps"},
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
			"action_group": map[string]interface{}{
				"type":        "string",
				"description": "Optional action group name used to disambiguate the action.",
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
			"action_group": map[string]interface{}{
				"type":        "string",
				"description": "Optional action group name used to disambiguate the action.",
			},
			"name": map[string]interface{}{
				"type":        "string",
				"description": "Saved web action name to delete.",
			},
		},
		"required": []string{"name"},
	}
}

type browserUseListWebActionsBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseListWebActionsBuiltin) GetName() string { return "browser_use_list_web_actions" }

func (b *browserUseListWebActionsBuiltin) GetDescription() string {
	return browserUseWithWebActionReflection("List executable Browser Web Actions, including required variables inferred from {{placeholders}} in the saved action script.")
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
	text, err := browserUseListWebActionsText(browserUseWebActionOwner(b.provider), arguments, rawURL)
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
	return browserUseWithWebActionReflection("Inspect recent Browser Use trace steps so the model can review prior attempts before authoring an explicit parameterized Browser Web Action steps array.")
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
	return browserUseWithWebActionReflection("Save an executable Browser Web Action under an action group. Provide an explicit parameterized steps array using open, click, type, and press steps; do not reference trace step ids.")
}

func (b *browserUseSaveWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionSaveSchema()
}

func (b *browserUseSaveWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseSaveWebActionText(browserUseWebActionOwner(b.provider), arguments)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use save web action failed: %s", err.Error())), nil
	}
	return browserUseTextWithState(b.provider, text), nil
}

type browserUseRunWebActionBuiltin struct{ provider *BrowserUseTool }

func (b *browserUseRunWebActionBuiltin) GetName() string { return "browser_use_run_web_action" }

func (b *browserUseRunWebActionBuiltin) GetDescription() string {
	return browserUseWithWebActionReflection("Run a saved executable Browser Web Action. Use variables to fill {{placeholder}} values captured in the action script.")
}

func (b *browserUseRunWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionRunSchema()
}

func (b *browserUseRunWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	name, _ := arguments["name"].(string)
	actionGroup := browserUseActionGroupArgument(arguments)
	action, err := browserUseResolveWebAction(browserUseWebActionOwner(b.provider), actionGroup, name)
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
	return browserUseWithWebActionReflection("Delete a saved executable Browser Web Action. Pass action_group when multiple action groups have an action with the same name.")
}

func (b *browserUseDeleteWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionDeleteSchema()
}

func (b *browserUseDeleteWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseDeleteWebActionText(browserUseWebActionOwner(b.provider), arguments)
	if err != nil {
		return browserUseErrorWithState(b.provider, fmt.Sprintf("browser use delete web action failed: %s", err.Error())), nil
	}
	return browserUseTextWithState(b.provider, text), nil
}

type chromeConnectListWebActionsBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectListWebActionsBuiltin) GetName() string { return "browser_use_list_web_actions" }

func (b *chromeConnectListWebActionsBuiltin) GetDescription() string {
	return browserUseWithWebActionReflection("List executable Browser Web Actions, including required variables inferred from {{placeholders}} in the saved action script.")
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
	text, err := browserUseListWebActionsText(browserUseWebActionOwner(b.provider), arguments, rawURL)
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
	return browserUseWithWebActionReflection("Inspect recent Browser Use trace steps so the model can review prior attempts before authoring an explicit parameterized Browser Web Action steps array.")
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
	return browserUseWithWebActionReflection("Save an executable Browser Web Action under an action group. Provide an explicit parameterized steps array using open, click, type, and press steps; do not reference trace step ids.")
}

func (b *chromeConnectSaveWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionSaveSchema()
}

func (b *chromeConnectSaveWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseSaveWebActionText(browserUseWebActionOwner(b.provider), arguments)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use save web action failed: %s", err.Error())), nil
	}
	return chromeConnectTextWithState(text), nil
}

type chromeConnectRunWebActionBuiltin struct{ provider *BrowserUseTool }

func (b *chromeConnectRunWebActionBuiltin) GetName() string { return "browser_use_run_web_action" }

func (b *chromeConnectRunWebActionBuiltin) GetDescription() string {
	return browserUseWithWebActionReflection("Run a saved executable Browser Web Action via the OpenAgent Chrome extension.")
}

func (b *chromeConnectRunWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionRunSchema()
}

func (b *chromeConnectRunWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	name, _ := arguments["name"].(string)
	actionGroup := browserUseActionGroupArgument(arguments)
	action, err := browserUseResolveWebAction(browserUseWebActionOwner(b.provider), actionGroup, name)
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
	return browserUseWithWebActionReflection("Delete a saved executable Browser Web Action. Pass action_group when multiple action groups have an action with the same name.")
}

func (b *chromeConnectDeleteWebActionBuiltin) GetInputSchema() interface{} {
	return browserUseWebActionDeleteSchema()
}

func (b *chromeConnectDeleteWebActionBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	text, err := browserUseDeleteWebActionText(browserUseWebActionOwner(b.provider), arguments)
	if err != nil {
		return chromeConnectErrorWithState(fmt.Sprintf("browser use delete web action failed: %s", err.Error())), nil
	}
	return chromeConnectTextWithState(text), nil
}
