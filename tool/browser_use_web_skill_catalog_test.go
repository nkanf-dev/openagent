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

func TestBrowserUseWebMemoryCatalog(t *testing.T) {
	useInMemoryBrowserUseWebSkillStore(t)

	_, err := browserUseSaveWebSkillText("admin", browserUsePageInfo{
		URL: "https://docs.example.com/search",
	}, map[string]interface{}{
		"name":  "docs_search",
		"skill": "# Docs search\n\nUse the search input to find documentation pages.",
	})
	if err != nil {
		t.Fatalf("save web skill: %v", err)
	}
	_, err = browserUseSaveWebActionText("admin", map[string]interface{}{
		"skill_name": "docs_search",
		"name":       "search_docs",
		"action":     "Open documentation search results.",
		"steps": []interface{}{
			map[string]interface{}{"kind": "open", "url": "https://docs.example.com/search?q={{query}}"},
		},
	})
	if err != nil {
		t.Fatalf("save web action: %v", err)
	}

	catalog, err := BrowserUseWebMemoryCatalog("admin")
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}
	if !strings.Contains(catalog, "Browser Web Memory Catalog") {
		t.Fatalf("expected web memory catalog heading, got %q", catalog)
	}
	if !strings.Contains(catalog, "docs_search (docs.example.com/search)") {
		t.Fatalf("expected site scope, got %q", catalog)
	}
	if !strings.Contains(catalog, "actions: search_docs(query)") {
		t.Fatalf("expected action variables, got %q", catalog)
	}
	if strings.Contains(catalog, "Use the search input to find documentation pages.") {
		t.Fatalf("catalog should include an index summary, not full web-skill content: %q", catalog)
	}
}
