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

package object

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/the-open-agent/openagent/tool"
	"xorm.io/core"
)

var browserUseWebActionPlaceholderPattern = regexp.MustCompile(`\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}`)

type BrowserUseWebAction struct {
	Owner       string `xorm:"varchar(100) notnull pk" json:"owner"`
	ActionGroup string `xorm:"varchar(100) notnull pk" json:"actionGroup"`
	Name        string `xorm:"varchar(100) notnull pk" json:"name"`
	URL         string `xorm:"varchar(500)" json:"url"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	UpdatedTime string `xorm:"varchar(100)" json:"updatedTime"`

	Action string `xorm:"mediumtext" json:"action"`
	Script string `xorm:"mediumtext" json:"script"`
}

func init() {
	tool.SetBrowserUseWebActionStore(listBrowserUseWebActions, upsertBrowserUseWebAction, deleteBrowserUseWebAction, listBrowserUseWebActionsByActionGroups)
}

func browserUseWebMemoryOwner(owner string) string {
	owner = strings.TrimSpace(owner)
	if owner == "" {
		return "admin"
	}
	return owner
}

func browserUseWebMemoryNow() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func listBrowserUseWebActions(owner string) ([]tool.BrowserUseWebActionData, error) {
	owner = browserUseWebMemoryOwner(owner)

	rows := []*BrowserUseWebAction{}
	err := adapter.engine.Desc("updated_time").Find(&rows, &BrowserUseWebAction{Owner: owner})
	if err != nil {
		return nil, err
	}

	actions := make([]tool.BrowserUseWebActionData, 0, len(rows))
	for _, row := range rows {
		actions = append(actions, tool.BrowserUseWebActionData{
			ActionGroup: row.ActionGroup,
			Name:        row.Name,
			URL:         row.URL,
			Action:      row.Action,
			Script:      row.Script,
			UpdatedTime: row.UpdatedTime,
		})
	}
	return actions, nil
}

func GetBrowserUseWebActionCatalog(owner string) (string, error) {
	actions, err := listBrowserUseWebActions(owner)
	if err != nil {
		return "", err
	}
	if len(actions) == 0 {
		return "", nil
	}
	sort.SliceStable(actions, func(i, j int) bool {
		if actions[i].ActionGroup != actions[j].ActionGroup {
			return actions[i].ActionGroup < actions[j].ActionGroup
		}
		return actions[i].Name < actions[j].Name
	})

	var builder strings.Builder
	builder.WriteString("## Browser Web Action Catalog\n")
	builder.WriteString("- Browser web actions are executable browser shortcuts, not skills.\n")
	builder.WriteString("- Never call `load_skill` for a browser web action group or action name.\n")
	builder.WriteString("- If the user's browser task matches one of these actions, call `browser_use_run_web_action` before manual navigation/clicking.\n")
	builder.WriteString("- Use the listed `action_group`, `action_name`, and variables when running an action.\n")
	builder.WriteString("- Always verify the resulting page state after running an action.\n\n")
	for _, action := range actions {
		name := strings.TrimSpace(action.Name)
		group := strings.TrimSpace(action.ActionGroup)
		if name == "" || group == "" {
			continue
		}
		variables := browserUseWebActionVariableNames(action.Script)
		builder.WriteString("- web_action:\n")
		builder.WriteString(fmt.Sprintf("  action_group: %s\n", group))
		builder.WriteString(fmt.Sprintf("  action_name: %s\n", name))
		builder.WriteString("  run_with: browser_use_run_web_action\n")
		if strings.TrimSpace(action.URL) != "" {
			builder.WriteString(fmt.Sprintf("  url: %s\n", strings.TrimSpace(action.URL)))
		}
		if len(variables) > 0 {
			builder.WriteString(fmt.Sprintf("  variables: %s\n", strings.Join(variables, ", ")))
		}
		if summary := firstBrowserUseWebActionLine(action.Action); summary != "" {
			builder.WriteString(fmt.Sprintf("  summary: %s\n", summary))
		}
	}
	return strings.TrimSpace(builder.String()), nil
}

func browserUseWebActionLoadSkillHint(owner string, actionGroup string) (string, error) {
	actionGroup = strings.TrimSpace(actionGroup)
	if actionGroup == "" {
		return "", nil
	}
	actions, err := listBrowserUseWebActions(owner)
	if err != nil {
		return "", err
	}

	matches := make([]string, 0)
	for _, action := range actions {
		group := strings.TrimSpace(action.ActionGroup)
		name := strings.TrimSpace(action.Name)
		if actionGroup != group && actionGroup != name {
			continue
		}
		matches = append(matches, fmt.Sprintf("%s / %s", group, name))
	}
	if len(matches) == 0 {
		return "", nil
	}
	sort.Strings(matches)
	return fmt.Sprintf(
		"%q is a browser web action identifier, not a skill. Do not call load_skill for browser web actions. Use browser_use_run_web_action with one of: %s",
		actionGroup,
		strings.Join(matches, ", "),
	), nil
}

func browserUseWebActionVariableNames(script string) []string {
	matches := browserUseWebActionPlaceholderPattern.FindAllStringSubmatch(script, -1)
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

func firstBrowserUseWebActionLine(action string) string {
	for _, line := range strings.Split(strings.TrimSpace(action), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if len(line) > 180 {
			line = line[:180] + "..."
		}
		return line
	}
	return ""
}

func listBrowserUseWebActionsByActionGroups(owner string, actionGroups []string) ([]tool.BrowserUseWebActionData, error) {
	owner = browserUseWebMemoryOwner(owner)

	names := make([]string, 0, len(actionGroups))
	seen := map[string]bool{}
	for _, actionGroup := range actionGroups {
		name := strings.TrimSpace(actionGroup)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	if len(names) == 0 {
		return []tool.BrowserUseWebActionData{}, nil
	}

	rows := []*BrowserUseWebAction{}
	err := adapter.engine.Where("owner = ?", owner).In("action_group", names).Desc("updated_time").Find(&rows)
	if err != nil {
		return nil, err
	}

	actions := make([]tool.BrowserUseWebActionData, 0, len(rows))
	for _, row := range rows {
		actions = append(actions, tool.BrowserUseWebActionData{
			ActionGroup: row.ActionGroup,
			Name:        row.Name,
			URL:         row.URL,
			Action:      row.Action,
			Script:      row.Script,
			UpdatedTime: row.UpdatedTime,
		})
	}
	return actions, nil
}

func upsertBrowserUseWebAction(owner string, action tool.BrowserUseWebActionData) (tool.BrowserUseWebActionData, error) {
	owner = browserUseWebMemoryOwner(owner)
	action.ActionGroup = strings.TrimSpace(action.ActionGroup)
	action.Name = strings.TrimSpace(action.Name)
	if action.ActionGroup == "" {
		return tool.BrowserUseWebActionData{}, fmt.Errorf("action_group is required")
	}
	if action.Name == "" {
		return tool.BrowserUseWebActionData{}, fmt.Errorf("name is required")
	}

	record := &BrowserUseWebAction{
		Owner:       owner,
		ActionGroup: action.ActionGroup,
		Name:        action.Name,
		URL:         strings.TrimSpace(action.URL),
		UpdatedTime: action.UpdatedTime,
		Action:      action.Action,
		Script:      action.Script,
	}

	existing := &BrowserUseWebAction{}
	existed, err := adapter.engine.ID(core.PK{owner, action.ActionGroup, action.Name}).Get(existing)
	if err != nil {
		return tool.BrowserUseWebActionData{}, err
	}
	if existed {
		record.CreatedTime = existing.CreatedTime
		if _, err = adapter.engine.ID(core.PK{owner, action.ActionGroup, action.Name}).AllCols().Update(record); err != nil {
			return tool.BrowserUseWebActionData{}, err
		}
		return action, nil
	}

	record.CreatedTime = browserUseWebMemoryNow()
	if _, err = adapter.engine.Insert(record); err != nil {
		return tool.BrowserUseWebActionData{}, err
	}
	return action, nil
}

func deleteBrowserUseWebAction(owner, actionGroup, name string) (bool, error) {
	owner = browserUseWebMemoryOwner(owner)
	actionGroup = strings.TrimSpace(actionGroup)
	name = strings.TrimSpace(name)

	affected, err := adapter.engine.ID(core.PK{owner, actionGroup, name}).Delete(&BrowserUseWebAction{})
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}
