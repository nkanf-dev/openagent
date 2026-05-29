package tool

import (
	"errors"
	"strings"
	"testing"
)

func useInMemoryBrowserUseWebSkillStore(t *testing.T) {
	t.Helper()
	skillStore := []BrowserUseWebSkillData{}
	actionStore := []BrowserUseWebActionData{}
	oldList := browserUseListWebSkillsFunc
	oldUpsert := browserUseUpsertWebSkillFunc
	oldDelete := browserUseDeleteWebSkillFunc
	oldExists := browserUseSkillExistsFunc
	oldActionList := browserUseListWebActionsFunc
	oldActionListBySkillNames := browserUseListWebActionsBySkillNamesFunc
	oldActionUpsert := browserUseUpsertWebActionFunc
	oldActionDelete := browserUseDeleteWebActionFunc
	SetBrowserUseWebSkillStore(
		func(owner string) ([]BrowserUseWebSkillData, error) {
			skills := make([]BrowserUseWebSkillData, len(skillStore))
			copy(skills, skillStore)
			return skills, nil
		},
		func(owner string, skill BrowserUseWebSkillData) (BrowserUseWebSkillData, error) {
			for i := range skillStore {
				if skillStore[i].Domain == skill.Domain && skillStore[i].PathPrefix == skill.PathPrefix && skillStore[i].Name == skill.Name {
					skillStore[i] = skill
					return skill, nil
				}
			}
			skillStore = append(skillStore, skill)
			return skill, nil
		},
		func(owner, name string) (bool, int64, error) {
			deletedSkill := false
			for i := range skillStore {
				if skillStore[i].Name == name {
					skillStore = append(skillStore[:i], skillStore[i+1:]...)
					deletedSkill = true
					break
				}
			}
			var deletedActions int64
			filteredActions := actionStore[:0]
			for _, action := range actionStore {
				if action.SkillName == name {
					deletedActions++
					continue
				}
				filteredActions = append(filteredActions, action)
			}
			actionStore = filteredActions
			return deletedSkill, deletedActions, nil
		},
		func(owner, name string) (bool, error) {
			for _, skill := range skillStore {
				if skill.Name == strings.TrimSpace(name) {
					return true, nil
				}
			}
			return false, nil
		},
	)
	SetBrowserUseWebActionStore(
		func(owner string) ([]BrowserUseWebActionData, error) {
			actions := make([]BrowserUseWebActionData, len(actionStore))
			copy(actions, actionStore)
			return actions, nil
		},
		func(owner string, action BrowserUseWebActionData) (BrowserUseWebActionData, error) {
			for i := range actionStore {
				if actionStore[i].SkillName == action.SkillName && actionStore[i].Name == action.Name {
					actionStore[i] = action
					return action, nil
				}
			}
			actionStore = append(actionStore, action)
			return action, nil
		},
		func(owner, skillName, name string) (bool, error) {
			for i := range actionStore {
				if actionStore[i].SkillName == skillName && actionStore[i].Name == name {
					actionStore = append(actionStore[:i], actionStore[i+1:]...)
					return true, nil
				}
			}
			return false, nil
		},
		func(owner string, skillNames []string) ([]BrowserUseWebActionData, error) {
			matchedSkillNames := map[string]bool{}
			for _, skillName := range skillNames {
				matchedSkillNames[strings.TrimSpace(skillName)] = true
			}
			actions := []BrowserUseWebActionData{}
			for _, action := range actionStore {
				if matchedSkillNames[action.SkillName] {
					actions = append(actions, action)
				}
			}
			return actions, nil
		},
	)
	t.Cleanup(func() {
		SetBrowserUseWebSkillStore(oldList, oldUpsert, oldDelete, oldExists)
		SetBrowserUseWebActionStore(oldActionList, oldActionUpsert, oldActionDelete, oldActionListBySkillNames)
	})
}

func testSearchActionSteps() []interface{} {
	return []interface{}{
		map[string]interface{}{
			"kind":     "click",
			"selector": `[data-openagent-browser-use-ref="5"]`,
		},
		map[string]interface{}{
			"kind":     "type",
			"selector": `[data-openagent-browser-use-ref="5"]`,
			"text":     "{{query}}",
			"clear":    true,
		},
	}
}

func TestBrowserUseSaveAndInjectWebSkill(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	text, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL:   "https://forum.example.com/forum-board-1.html",
		Title: "Forum board",
	}, map[string]interface{}{
		"name":        "forum-search",
		"path_prefix": "/forum-board",
		"skill": strings.TrimSpace(`
# Forum Search

Use the top search box to search posts.

## Script: search_posts
1. Click the search input.
2. Type {{query}}.
3. Click the Search button.
`),
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}
	if !strings.Contains(text, "Web-skill markdown is reference memory only") {
		t.Fatalf("expected reference-only warning after saving script-like skill, got %q", text)
	}

	snapshot := "URL: https://forum.example.com/forum-board-1.html\nTitle: Forum\n\nInteractive elements:\n[1] <input> Search"
	augmented, err := browserUseAugmentSnapshotWithWebSkills("admin", "https://forum.example.com/forum-board-1.html", snapshot)
	if err != nil {
		t.Fatalf("augment snapshot: %v", err)
	}
	if !strings.Contains(augmented, "Browser Web Skills:") {
		t.Fatalf("expected web skill section, got %q", augmented)
	}
	if !strings.Contains(augmented, "Script: search_posts") {
		t.Fatalf("expected script content, got %q", augmented)
	}
	if !strings.Contains(augmented, "No executable web actions are saved") {
		t.Fatalf("expected missing executable action guidance, got %q", augmented)
	}
}

func TestBrowserUseSaveWebSkillExplainsActionFollowUp(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	text, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://games.example.com/",
	}, map[string]interface{}{
		"name":        "games-exploration",
		"path_prefix": "/",
		"skill": strings.TrimSpace(`
# Games Site Exploration

The home page has tabs, a search box, filters, game cards, and pagination.

## Reusable workflows
- Search by game title from the home page.
- Filter by genre, rating, and release date.
- Open a game detail page from a card.
`),
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}
	if !strings.Contains(text, "Web-skill markdown is reference memory only") {
		t.Fatalf("expected reference-only warning, got %q", text)
	}
}

func TestBrowserUseWebSkillPathDashMatch(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://forum.example.com/forum-board-1.html",
	}, map[string]interface{}{
		"name":        "forum-board",
		"path_prefix": "/forum-board",
		"skill":       "Forum board skill.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}

	skills, err := browserUseMatchWebSkills("admin", "https://forum.example.com/forum-board-2.html")
	if err != nil {
		t.Fatalf("match web skills: %v", err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected one matched skill, got %+v", skills)
	}
}

func TestBrowserUseWebSkillWildcardMatch(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://forum.example.com/forum-board-1.html",
	}, map[string]interface{}{
		"name":        "forum-wildcard",
		"url":         "https://*.example.com/forum-board-1.html",
		"path_prefix": "/forum-*",
		"skill":       "Wildcard forum skill.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}

	skills, err := browserUseMatchWebSkills("admin", "https://news.example.com/forum-board-2.html")
	if err != nil {
		t.Fatalf("match web skills: %v", err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected one wildcard matched skill, got %+v", skills)
	}
}

func TestBrowserUseWebSkillFuzzySiteMatch(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://www.video.example.com/watch/123",
	}, map[string]interface{}{
		"name":        "video-site",
		"path_prefix": "/watch/123",
		"skill":       "Video site skill.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}

	skills, err := browserUseMatchWebSkills("admin", "https://search.video.example.com/all?keyword=test")
	if err != nil {
		t.Fatalf("match web skills: %v", err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected fuzzy site match across subdomain and path, got %+v", skills)
	}
}

func TestBrowserUseSaveAndInjectExecutableWebAction(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://forum.example.com/",
	}, map[string]interface{}{
		"name":        "forum-search",
		"path_prefix": "/",
		"skill":       "Use the forum search box for post lookup.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}

	_, err = browserUseSaveWebActionText("admin", map[string]interface{}{
		"skill_name":  "forum-search",
		"name":        "search_posts",
		"description": "Search forum posts.",
		"steps":       testSearchActionSteps(),
	})
	if err != nil {
		t.Fatalf("save web action: %v", err)
	}

	action, err := browserUseResolveWebAction("admin", "forum-search", "search_posts")
	if err != nil {
		t.Fatalf("find web action: %v", err)
	}
	steps, err := browserUseDecodeWebActionScript(action)
	if err != nil {
		t.Fatalf("decode web action script: %v", err)
	}
	if len(steps) != 2 || steps[1].Text != "{{query}}" {
		t.Fatalf("unexpected saved steps: %+v", steps)
	}
	variables := browserUseWebActionVariableNames(action)
	if len(variables) != 1 || variables[0] != "query" {
		t.Fatalf("expected query variable, got %+v", variables)
	}

	augmented, err := browserUseAugmentSnapshotWithWebSkills("admin", "https://forum.example.com/", "URL: https://forum.example.com/\n\nInteractive elements:\n[5] <input> Search")
	if err != nil {
		t.Fatalf("augment snapshot: %v", err)
	}
	if !strings.Contains(augmented, "Saved Web Actions") || !strings.Contains(augmented, "Required variables: query") {
		t.Fatalf("expected injected executable action guidance, got %q", augmented)
	}
}

func TestBrowserUseListWebActionsShowsVariables(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://forum.example.com/",
	}, map[string]interface{}{
		"name":        "forum-search",
		"path_prefix": "/",
		"skill":       "Use the forum search box.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}

	_, err = browserUseSaveWebActionText("admin", map[string]interface{}{
		"skill_name": "forum-search",
		"name":       "advanced_search_url",
		"steps": []interface{}{
			map[string]interface{}{
				"kind": "open",
				"url":  "https://search.example.com/{{search_type}}?keyword={{keyword}}&tids={{tids}}",
			},
		},
	})
	if err != nil {
		t.Fatalf("save web action: %v", err)
	}

	text, err := browserUseListWebActionsText("admin", map[string]interface{}{
		"skill_name": "forum-search",
	}, "")
	if err != nil {
		t.Fatalf("list web actions: %v", err)
	}
	if !strings.Contains(text, "advanced_search_url") || !strings.Contains(text, "keyword") || !strings.Contains(text, "search_type") || !strings.Contains(text, "tids") {
		t.Fatalf("expected variables in list output, got %q", text)
	}
}

func TestBrowserUseSaveWebActionUsesSkillExistsHook(t *testing.T) {
	oldList := browserUseListWebSkillsFunc
	oldUpsert := browserUseUpsertWebSkillFunc
	oldDelete := browserUseDeleteWebSkillFunc
	oldExists := browserUseSkillExistsFunc
	oldActionList := browserUseListWebActionsFunc
	oldActionListBySkillNames := browserUseListWebActionsBySkillNamesFunc
	oldActionUpsert := browserUseUpsertWebActionFunc
	oldActionDelete := browserUseDeleteWebActionFunc

	SetBrowserUseWebSkillStore(
		func(owner string) ([]BrowserUseWebSkillData, error) {
			return nil, errors.New("full skill list should not be used")
		},
		oldUpsert,
		oldDelete,
		func(owner, name string) (bool, error) {
			return name == "forum-search", nil
		},
	)
	SetBrowserUseWebActionStore(
		oldActionList,
		func(owner string, action BrowserUseWebActionData) (BrowserUseWebActionData, error) {
			return action, nil
		},
		oldActionDelete,
		oldActionListBySkillNames,
	)
	t.Cleanup(func() {
		SetBrowserUseWebSkillStore(oldList, oldUpsert, oldDelete, oldExists)
		SetBrowserUseWebActionStore(oldActionList, oldActionUpsert, oldActionDelete, oldActionListBySkillNames)
	})

	_, err := browserUseSaveWebActionText("admin", map[string]interface{}{
		"skill_name": "forum-search",
		"name":       "search_posts",
		"steps":      testSearchActionSteps(),
	})
	if err != nil {
		t.Fatalf("save web action: %v", err)
	}
}

func TestBrowserUseAugmentSnapshotLoadsActionsByMatchedSkillNames(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	for _, item := range []struct {
		name string
		path string
	}{
		{name: "forum-one", path: "/one"},
		{name: "forum-two", path: "/two"},
	} {
		_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
			URL: "https://forum.example.com" + item.path,
		}, map[string]interface{}{
			"name":        item.name,
			"path_prefix": item.path,
			"skill":       "Use the forum page.",
		})
		if err != nil {
			t.Fatalf("save web skill: %v", err)
		}
	}

	oldActionList := browserUseListWebActionsFunc
	oldActionListBySkillNames := browserUseListWebActionsBySkillNamesFunc
	SetBrowserUseWebActionStore(
		func(owner string) ([]BrowserUseWebActionData, error) {
			return nil, errors.New("full action list should not be used")
		},
		browserUseUpsertWebActionFunc,
		browserUseDeleteWebActionFunc,
		func(owner string, skillNames []string) ([]BrowserUseWebActionData, error) {
			matchedSkillNames := map[string]bool{}
			for _, skillName := range skillNames {
				matchedSkillNames[skillName] = true
			}
			if !matchedSkillNames["forum-one"] || !matchedSkillNames["forum-two"] {
				t.Fatalf("expected matched skill names, got %+v", skillNames)
			}
			return []BrowserUseWebActionData{{
				SkillName: "forum-one",
				Name:      "search_posts",
				Script:    `[{"kind":"type","selector":"#q","text":"{{ query }}"}]`,
			}}, nil
		},
	)
	t.Cleanup(func() {
		SetBrowserUseWebActionStore(oldActionList, browserUseUpsertWebActionFunc, browserUseDeleteWebActionFunc, oldActionListBySkillNames)
	})

	augmented, err := browserUseAugmentSnapshotWithWebSkills("admin", "https://forum.example.com/one", "URL: https://forum.example.com/one")
	if err != nil {
		t.Fatalf("augment snapshot: %v", err)
	}
	if !strings.Contains(augmented, "search_posts") {
		t.Fatalf("expected matched skill action, got %q", augmented)
	}
}

func TestBrowserUseRunWebActionRejectsMissingVariables(t *testing.T) {
	action := browserUseWebAction{
		Name:   "advanced_search_url",
		Script: `[{"kind":"open","url":"https://search.example.com/{{search_type}}?keyword={{keyword}}&tids={{tids}}"}]`,
	}
	err := browserUseValidateWebActionVariables(action, map[string]string{
		"keyword": "pop",
	})
	if err == nil {
		t.Fatal("expected missing variable error")
	}
	if !strings.Contains(err.Error(), "search_type") || !strings.Contains(err.Error(), "tids") || !strings.Contains(err.Error(), "variables") {
		t.Fatalf("expected actionable missing variable error, got %v", err)
	}
}

func TestBrowserUseApplyVariablesSupportsWhitespacePlaceholders(t *testing.T) {
	text := browserUseApplyVariables("https://search.example.com/?q={{ query }}&type={{type}}", map[string]string{
		"query": "test",
		"type":  "video",
	})
	if text != "https://search.example.com/?q=test&type=video" {
		t.Fatalf("unexpected replacement result: %q", text)
	}
}

func TestBrowserUseActionTraceIsScopedByProviderTraceKey(t *testing.T) {
	first := &BrowserUseTool{owner: "admin", traceKey: "admin|session-one"}
	second := &BrowserUseTool{owner: "admin", traceKey: "admin|session-two"}

	browserUseRecordProviderWebActionTrace(first, browserUseWebActionTraceStep{Summary: "first trace"})
	browserUseRecordProviderWebActionTrace(second, browserUseWebActionTraceStep{Summary: "second trace"})

	firstTrace := browserUseInspectWebActionTraceText(browserUseTraceKey(first), 10)
	if !strings.Contains(firstTrace, "first trace") || strings.Contains(firstTrace, "second trace") {
		t.Fatalf("expected isolated first trace, got %q", firstTrace)
	}
	secondTrace := browserUseInspectWebActionTraceText(browserUseTraceKey(second), 10)
	if !strings.Contains(secondTrace, "second trace") || strings.Contains(secondTrace, "first trace") {
		t.Fatalf("expected isolated second trace, got %q", secondTrace)
	}
}

func TestBrowserUseActionTraceSummaryIncludesOutcomeContext(t *testing.T) {
	summary := browserUseTraceSummary(browserUseWebActionTraceStep{
		ID:          "bua_000001",
		Summary:     "click index=5",
		Kind:        "click",
		Target:      "index=5",
		Selector:    `[data-openagent-browser-use-ref="5"]`,
		URLBefore:   "https://example.com/",
		URLAfter:    "https://example.com/search?q=test",
		TitleBefore: "Example",
		TitleAfter:  "Search results",
		Outcome:     "page changed",
	})

	for _, expected := range []string{
		"kind: click",
		"target: index=5",
		"transition: https://example.com/ -> https://example.com/search?q=test",
		"title: Example -> Search results",
		"outcome: page changed",
	} {
		if !strings.Contains(summary, expected) {
			t.Fatalf("expected %q in trace summary %q", expected, summary)
		}
	}
}

func TestBrowserUseSaveWebActionRejectsMissingKind(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://forum.example.com/",
	}, map[string]interface{}{
		"name":        "forum-search",
		"path_prefix": "/",
		"skill":       "Use the forum search box.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}

	_, err = browserUseSaveWebActionText("admin", map[string]interface{}{
		"skill_name": "forum-search",
		"name":       "search",
		"steps": []interface{}{
			map[string]interface{}{"summary": "old malformed script"},
		},
	})
	if err == nil {
		t.Fatal("expected missing kind error")
	}
	if !strings.Contains(err.Error(), "missing its action kind") || !strings.Contains(err.Error(), "explicit parameterized steps") {
		t.Fatalf("expected actionable missing kind error, got %v", err)
	}
}

func TestBrowserUseDecodeWebActionScriptExplainsLegacyMissingKind(t *testing.T) {
	_, err := browserUseDecodeWebActionScript(browserUseWebAction{
		Name:   "search",
		Script: `[{"summary":"old malformed script"}]`,
	})
	if err == nil {
		t.Fatal("expected missing kind error")
	}
	if !strings.Contains(err.Error(), `web action "search" is not executable`) || !strings.Contains(err.Error(), "explicit parameterized steps") {
		t.Fatalf("expected actionable legacy script error, got %v", err)
	}
}

func TestBrowserUseDeleteWebAction(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://forum.example.com/",
	}, map[string]interface{}{
		"name":        "forum-search",
		"path_prefix": "/",
		"skill":       "Use the forum search box.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}

	_, err = browserUseSaveWebActionText("admin", map[string]interface{}{
		"skill_name": "forum-search",
		"name":       "search_posts",
		"steps":      testSearchActionSteps(),
	})
	if err != nil {
		t.Fatalf("save web action: %v", err)
	}

	text, err := browserUseDeleteWebActionText("admin", map[string]interface{}{
		"name": "search_posts",
	})
	if err != nil {
		t.Fatalf("delete web action: %v", err)
	}
	if !strings.Contains(text, "Deleted browser web action") {
		t.Fatalf("unexpected delete response: %q", text)
	}
	if _, err = browserUseResolveWebAction("admin", "forum-search", "search_posts"); err == nil {
		t.Fatal("expected deleted web action to be missing")
	}
}

func TestBrowserUseDeleteWebActionRequiresSkillNameWhenAmbiguous(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	for _, skillName := range []string{"forum-one", "forum-two"} {
		_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
			URL: "https://forum.example.com/",
		}, map[string]interface{}{
			"name":        skillName,
			"path_prefix": "/",
			"skill":       "Use the forum search box.",
		})
		if err != nil {
			t.Fatalf("save web skill: %v", err)
		}
		_, err = browserUseSaveWebActionText("admin", map[string]interface{}{
			"skill_name": skillName,
			"name":       "search_posts",
			"steps":      testSearchActionSteps(),
		})
		if err != nil {
			t.Fatalf("save web action: %v", err)
		}
	}

	_, err := browserUseDeleteWebActionText("admin", map[string]interface{}{
		"name": "search_posts",
	})
	if err == nil {
		t.Fatal("expected ambiguous delete error")
	}
	if !strings.Contains(err.Error(), "pass skill_name to disambiguate") {
		t.Fatalf("expected disambiguation error, got %v", err)
	}
}

func TestBrowserUseResolveWebActionRequiresSkillNameWhenAmbiguous(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	for _, skillName := range []string{"forum-one", "forum-two"} {
		_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
			URL: "https://forum.example.com/",
		}, map[string]interface{}{
			"name":        skillName,
			"path_prefix": "/",
			"skill":       "Use the forum search box.",
		})
		if err != nil {
			t.Fatalf("save web skill: %v", err)
		}
		_, err = browserUseSaveWebActionText("admin", map[string]interface{}{
			"skill_name": skillName,
			"name":       "search_posts",
			"steps":      testSearchActionSteps(),
		})
		if err != nil {
			t.Fatalf("save web action: %v", err)
		}
	}

	_, err := browserUseResolveWebAction("admin", "", "search_posts")
	if err == nil {
		t.Fatal("expected ambiguous resolve error")
	}
	if !strings.Contains(err.Error(), "pass skill_name to disambiguate") {
		t.Fatalf("expected disambiguation error, got %v", err)
	}
}

func TestBrowserUseDeleteWebSkillAlsoDeletesActions(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://forum.example.com/",
	}, map[string]interface{}{
		"name":        "forum-search",
		"path_prefix": "/",
		"skill":       "Use the forum search box.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}

	_, err = browserUseSaveWebActionText("admin", map[string]interface{}{
		"skill_name": "forum-search",
		"name":       "search_posts",
		"steps":      testSearchActionSteps(),
	})
	if err != nil {
		t.Fatalf("save web action: %v", err)
	}

	text, err := browserUseDeleteWebSkillText("admin", map[string]interface{}{
		"name": "forum-search",
	})
	if err != nil {
		t.Fatalf("delete web skill: %v", err)
	}
	if !strings.Contains(text, "1 associated web action") {
		t.Fatalf("unexpected delete response: %q", text)
	}
	if _, err = browserUseResolveWebAction("admin", "forum-search", "search_posts"); err == nil {
		t.Fatal("expected associated web action to be deleted")
	}
	skills, err := browserUseMatchWebSkills("admin", "https://forum.example.com/")
	if err != nil {
		t.Fatalf("match web skills: %v", err)
	}
	if len(skills) != 0 {
		t.Fatalf("expected deleted web skill to be missing, got %+v", skills)
	}
}

func TestBrowserUseAugmentSnapshotReturnsActionStoreError(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://forum.example.com/",
	}, map[string]interface{}{
		"name":        "forum-search",
		"path_prefix": "/",
		"skill":       "Use the forum search box.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}

	expected := errors.New("action store unavailable")
	oldActionList := browserUseListWebActionsFunc
	oldActionListBySkillNames := browserUseListWebActionsBySkillNamesFunc
	SetBrowserUseWebActionStore(
		func(owner string) ([]BrowserUseWebActionData, error) {
			return nil, expected
		},
		browserUseUpsertWebActionFunc,
		browserUseDeleteWebActionFunc,
		func(owner string, skillNames []string) ([]BrowserUseWebActionData, error) {
			return nil, expected
		},
	)
	t.Cleanup(func() {
		SetBrowserUseWebActionStore(oldActionList, browserUseUpsertWebActionFunc, browserUseDeleteWebActionFunc, oldActionListBySkillNames)
	})

	_, err = browserUseAugmentSnapshotWithWebSkills("admin", "https://forum.example.com/", "URL: https://forum.example.com/")
	if !errors.Is(err, expected) {
		t.Fatalf("expected action store error, got %v", err)
	}
}
