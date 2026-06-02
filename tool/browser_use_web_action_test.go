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
	"strings"
	"testing"
)

func useInMemoryBrowserUseWebActionStore(t *testing.T) {
	t.Helper()
	actionStore := []BrowserUseWebActionData{}
	oldActionList := browserUseListWebActionsFunc
	oldActionListByActionGroups := browserUseListWebActionsByActionGroupsFunc
	oldActionUpsert := browserUseUpsertWebActionFunc
	oldActionDelete := browserUseDeleteWebActionFunc
	SetBrowserUseWebActionStore(
		func(owner string) ([]BrowserUseWebActionData, error) {
			actions := make([]BrowserUseWebActionData, len(actionStore))
			copy(actions, actionStore)
			return actions, nil
		},
		func(owner string, action BrowserUseWebActionData) (BrowserUseWebActionData, error) {
			for i := range actionStore {
				if actionStore[i].ActionGroup == action.ActionGroup && actionStore[i].Name == action.Name {
					actionStore[i] = action
					return action, nil
				}
			}
			actionStore = append(actionStore, action)
			return action, nil
		},
		func(owner, actionGroup, name string) (bool, error) {
			for i := range actionStore {
				if actionStore[i].ActionGroup == actionGroup && actionStore[i].Name == name {
					actionStore = append(actionStore[:i], actionStore[i+1:]...)
					return true, nil
				}
			}
			return false, nil
		},
		func(owner string, actionGroups []string) ([]BrowserUseWebActionData, error) {
			matchedActionGroups := map[string]bool{}
			for _, actionGroup := range actionGroups {
				matchedActionGroups[strings.TrimSpace(actionGroup)] = true
			}
			actions := []BrowserUseWebActionData{}
			for _, action := range actionStore {
				if matchedActionGroups[action.ActionGroup] {
					actions = append(actions, action)
				}
			}
			return actions, nil
		},
	)
	t.Cleanup(func() {
		SetBrowserUseWebActionStore(oldActionList, oldActionUpsert, oldActionDelete, oldActionListByActionGroups)
	})
}

func TestSaveBrowserUseWebActionAcceptsExtensionPayloadAliases(t *testing.T) {
	useInMemoryBrowserUseWebActionStore(t)

	action, stepCount, err := SaveBrowserUseWebAction("admin", map[string]interface{}{
		"actionGroup": "docs",
		"name":        "search",
		"script":      `[{"kind":"navigate","url":"https://docs.example.com/search?q={{query}}"}]`,
	})
	if err != nil {
		t.Fatalf("save web action: %v", err)
	}
	if stepCount != 1 {
		t.Fatalf("expected 1 step, got %d", stepCount)
	}
	if action.ActionGroup != "docs" || action.Name != "search" {
		t.Fatalf("unexpected saved action: %+v", action)
	}
	if !strings.Contains(action.Script, `"kind":"open"`) {
		t.Fatalf("expected navigate alias to be normalized to open, got %q", action.Script)
	}
}

func TestBrowserUseListWebActionsFiltersByActionGroup(t *testing.T) {
	useInMemoryBrowserUseWebActionStore(t)

	_, _, err := SaveBrowserUseWebAction("admin", map[string]interface{}{
		"action_group": "docs",
		"name":         "search_docs",
		"steps": []interface{}{
			map[string]interface{}{"kind": "open", "url": "https://docs.example.com/search?q={{query}}"},
		},
	})
	if err != nil {
		t.Fatalf("save docs action: %v", err)
	}
	_, _, err = SaveBrowserUseWebAction("admin", map[string]interface{}{
		"action_group": "forum",
		"name":         "search_forum",
		"steps": []interface{}{
			map[string]interface{}{"kind": "open", "url": "https://forum.example.com/search?q={{query}}"},
		},
	})
	if err != nil {
		t.Fatalf("save forum action: %v", err)
	}

	text, err := browserUseListWebActionsText("admin", map[string]interface{}{"action_group": "docs"}, "")
	if err != nil {
		t.Fatalf("list actions: %v", err)
	}
	if !strings.Contains(text, "docs / search_docs") {
		t.Fatalf("expected docs action, got %q", text)
	}
	if strings.Contains(text, "search_forum") {
		t.Fatalf("did not expect forum action, got %q", text)
	}
}

func TestListBrowserUseWebActionsFiltersByCurrentURL(t *testing.T) {
	useInMemoryBrowserUseWebActionStore(t)

	_, _, err := SaveBrowserUseWebAction("admin", map[string]interface{}{
		"action_group": "video",
		"name":         "search",
		"url":          "https://www.example.com/search",
		"steps": []interface{}{
			map[string]interface{}{"kind": "open", "url": "https://www.example.com/search?q={{query}}"},
		},
	})
	if err != nil {
		t.Fatalf("save matching action: %v", err)
	}
	_, _, err = SaveBrowserUseWebAction("admin", map[string]interface{}{
		"action_group": "docs",
		"name":         "search",
		"url":          "https://docs.other.test/search",
		"steps": []interface{}{
			map[string]interface{}{"kind": "open", "url": "https://docs.other.test/search?q={{query}}"},
		},
	})
	if err != nil {
		t.Fatalf("save non-matching action: %v", err)
	}

	actions, err := ListBrowserUseWebActions("admin", BrowserUseWebActionFilter{URL: "https://search.example.com/results?q=agent"})
	if err != nil {
		t.Fatalf("list actions: %v", err)
	}
	if len(actions) != 1 || actions[0].ActionGroup != "video" {
		t.Fatalf("expected same registrable-domain action, got %+v", actions)
	}

	actions, err = ListBrowserUseWebActions("admin", BrowserUseWebActionFilter{URL: "https://www.example.com.evil.test/search"})
	if err != nil {
		t.Fatalf("list evil host actions: %v", err)
	}
	if len(actions) != 0 {
		t.Fatalf("expected no action for prefix-spoofed host, got %+v", actions)
	}

	text, err := browserUseListWebActionsText("admin", map[string]interface{}{}, "https://search.example.com/results?q=agent")
	if err != nil {
		t.Fatalf("list action text by url: %v", err)
	}
	if !strings.Contains(text, "video / search") {
		t.Fatalf("expected same-site action in list text, got %q", text)
	}
	if strings.Contains(text, "docs / search") {
		t.Fatalf("did not expect cross-site action in list text, got %q", text)
	}
}

func TestDeleteBrowserUseWebActionResolvesAmbiguity(t *testing.T) {
	useInMemoryBrowserUseWebActionStore(t)

	for _, group := range []string{"docs", "forum"} {
		_, _, err := SaveBrowserUseWebAction("admin", map[string]interface{}{
			"action_group": group,
			"name":         "search",
			"steps": []interface{}{
				map[string]interface{}{"kind": "open", "url": "https://" + group + ".example.com/search?q={{query}}"},
			},
		})
		if err != nil {
			t.Fatalf("save %s action: %v", group, err)
		}
	}

	if _, _, err := DeleteBrowserUseWebAction("admin", "", "search"); err == nil {
		t.Fatalf("expected ambiguous delete to fail")
	}
	deleted, ok, err := DeleteBrowserUseWebAction("admin", "docs", "search")
	if err != nil {
		t.Fatalf("delete docs action: %v", err)
	}
	if !ok || deleted.ActionGroup != "docs" {
		t.Fatalf("unexpected deleted action: ok=%v action=%+v", ok, deleted)
	}
}

func TestSaveBrowserUseWebActionStoresStartURL(t *testing.T) {
	useInMemoryBrowserUseWebActionStore(t)

	action, _, err := SaveBrowserUseWebAction("admin", map[string]interface{}{
		"action_group": "forum",
		"name":         "login",
		"url":          "https://forum.example.com/login",
		"steps": []interface{}{
			map[string]interface{}{"kind": "click", "selector": "input[name=username]"},
			map[string]interface{}{"kind": "type", "selector": "input[name=username]", "text": "{{username}}"},
		},
	})
	if err != nil {
		t.Fatalf("save web action: %v", err)
	}
	if action.URL != "https://forum.example.com/login" {
		t.Fatalf("expected start URL to be saved, got %q", action.URL)
	}
}

func TestBrowserUseRunWebActionRequiresVariables(t *testing.T) {
	action := browserUseWebAction{
		Name:   "search",
		Script: `[{"kind":"open","url":"https://docs.example.com/search?q={{ query }}"}]`,
	}

	if err := browserUseValidateWebActionVariables(action, map[string]string{}); err == nil {
		t.Fatalf("expected missing variable error")
	}
	if err := browserUseValidateWebActionVariables(action, map[string]string{"query": "agent"}); err != nil {
		t.Fatalf("expected variables to satisfy action: %v", err)
	}
}
