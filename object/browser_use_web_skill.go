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
	"strings"
	"time"

	"github.com/the-open-agent/openagent/tool"
	"xorm.io/core"
)

type BrowserUseWebSkill struct {
	Owner       string `xorm:"varchar(100) notnull pk" json:"owner"`
	Name        string `xorm:"varchar(100) notnull pk" json:"name"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	UpdatedTime string `xorm:"varchar(100)" json:"updatedTime"`

	Domain     string `xorm:"varchar(200) index" json:"domain"`
	PathPrefix string `xorm:"varchar(500)" json:"pathPrefix"`
	Skill      string `xorm:"mediumtext" json:"skill"`
}

type BrowserUseWebAction struct {
	Owner       string `xorm:"varchar(100) notnull pk" json:"owner"`
	SkillName   string `xorm:"varchar(100) notnull pk" json:"skillName"`
	Name        string `xorm:"varchar(100) notnull pk" json:"name"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	UpdatedTime string `xorm:"varchar(100)" json:"updatedTime"`

	Action string `xorm:"mediumtext" json:"action"`
	Script string `xorm:"mediumtext" json:"script"`
}

func init() {
	tool.SetBrowserUseWebSkillStore(listBrowserUseWebSkills, upsertBrowserUseWebSkill, deleteBrowserUseWebSkill, browserUseWebSkillExists)
	tool.SetBrowserUseWebActionStore(listBrowserUseWebActions, upsertBrowserUseWebAction, deleteBrowserUseWebAction, listBrowserUseWebActionsBySkillNames)
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

func listBrowserUseWebSkills(owner string) ([]tool.BrowserUseWebSkillData, error) {
	owner = browserUseWebMemoryOwner(owner)
	rows := []*BrowserUseWebSkill{}
	err := adapter.engine.Desc("updated_time").Find(&rows, &BrowserUseWebSkill{Owner: owner})
	if err != nil {
		return nil, err
	}

	skills := make([]tool.BrowserUseWebSkillData, 0, len(rows))
	for _, row := range rows {
		skills = append(skills, tool.BrowserUseWebSkillData{
			Domain:      row.Domain,
			PathPrefix:  row.PathPrefix,
			Name:        row.Name,
			Skill:       row.Skill,
			UpdatedTime: row.UpdatedTime,
		})
	}
	return skills, nil
}

func browserUseWebSkillExists(owner, name string) (bool, error) {
	owner = browserUseWebMemoryOwner(owner)
	name = strings.TrimSpace(name)
	if name == "" {
		return false, nil
	}

	return adapter.engine.ID(core.PK{owner, name}).Exist(&BrowserUseWebSkill{})
}

func upsertBrowserUseWebSkill(owner string, skill tool.BrowserUseWebSkillData) (tool.BrowserUseWebSkillData, error) {
	owner = browserUseWebMemoryOwner(owner)
	skill.Name = strings.TrimSpace(skill.Name)
	if skill.Name == "" {
		return tool.BrowserUseWebSkillData{}, fmt.Errorf("name is required")
	}

	record := &BrowserUseWebSkill{
		Owner:       owner,
		Name:        skill.Name,
		UpdatedTime: skill.UpdatedTime,
		Domain:      skill.Domain,
		PathPrefix:  skill.PathPrefix,
		Skill:       skill.Skill,
	}

	existing := &BrowserUseWebSkill{}
	existed, err := adapter.engine.ID(core.PK{owner, skill.Name}).Get(existing)
	if err != nil {
		return tool.BrowserUseWebSkillData{}, err
	}
	if existed {
		record.CreatedTime = existing.CreatedTime
		if _, err = adapter.engine.ID(core.PK{owner, skill.Name}).AllCols().Update(record); err != nil {
			return tool.BrowserUseWebSkillData{}, err
		}
		return skill, nil
	}

	record.CreatedTime = browserUseWebMemoryNow()
	if _, err = adapter.engine.Insert(record); err != nil {
		return tool.BrowserUseWebSkillData{}, err
	}
	return skill, nil
}

func deleteBrowserUseWebSkill(owner, name string) (bool, int64, error) {
	owner = browserUseWebMemoryOwner(owner)
	name = strings.TrimSpace(name)

	session := adapter.engine.NewSession()
	defer session.Close()

	if err := session.Begin(); err != nil {
		return false, 0, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = session.Rollback()
		}
	}()

	deletedActions, err := session.Delete(&BrowserUseWebAction{Owner: owner, SkillName: name})
	if err != nil {
		return false, 0, err
	}
	deletedSkills, err := session.ID(core.PK{owner, name}).Delete(&BrowserUseWebSkill{})
	if err != nil {
		return false, 0, err
	}
	if err = session.Commit(); err != nil {
		return false, 0, err
	}
	committed = true
	return deletedSkills != 0, deletedActions, nil
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
			SkillName:   row.SkillName,
			Name:        row.Name,
			Action:      row.Action,
			Script:      row.Script,
			UpdatedTime: row.UpdatedTime,
		})
	}
	return actions, nil
}

func listBrowserUseWebActionsBySkillNames(owner string, skillNames []string) ([]tool.BrowserUseWebActionData, error) {
	owner = browserUseWebMemoryOwner(owner)

	names := make([]string, 0, len(skillNames))
	seen := map[string]bool{}
	for _, skillName := range skillNames {
		name := strings.TrimSpace(skillName)
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
	err := adapter.engine.Where("owner = ?", owner).In("skill_name", names).Desc("updated_time").Find(&rows)
	if err != nil {
		return nil, err
	}

	actions := make([]tool.BrowserUseWebActionData, 0, len(rows))
	for _, row := range rows {
		actions = append(actions, tool.BrowserUseWebActionData{
			SkillName:   row.SkillName,
			Name:        row.Name,
			Action:      row.Action,
			Script:      row.Script,
			UpdatedTime: row.UpdatedTime,
		})
	}
	return actions, nil
}

func upsertBrowserUseWebAction(owner string, action tool.BrowserUseWebActionData) (tool.BrowserUseWebActionData, error) {
	owner = browserUseWebMemoryOwner(owner)
	action.SkillName = strings.TrimSpace(action.SkillName)
	action.Name = strings.TrimSpace(action.Name)
	if action.SkillName == "" {
		return tool.BrowserUseWebActionData{}, fmt.Errorf("skill_name is required")
	}
	if action.Name == "" {
		return tool.BrowserUseWebActionData{}, fmt.Errorf("name is required")
	}

	record := &BrowserUseWebAction{
		Owner:       owner,
		SkillName:   action.SkillName,
		Name:        action.Name,
		UpdatedTime: action.UpdatedTime,
		Action:      action.Action,
		Script:      action.Script,
	}

	existing := &BrowserUseWebAction{}
	existed, err := adapter.engine.ID(core.PK{owner, action.SkillName, action.Name}).Get(existing)
	if err != nil {
		return tool.BrowserUseWebActionData{}, err
	}
	if existed {
		record.CreatedTime = existing.CreatedTime
		if _, err = adapter.engine.ID(core.PK{owner, action.SkillName, action.Name}).AllCols().Update(record); err != nil {
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

func deleteBrowserUseWebAction(owner, skillName, name string) (bool, error) {
	owner = browserUseWebMemoryOwner(owner)
	skillName = strings.TrimSpace(skillName)
	name = strings.TrimSpace(name)

	affected, err := adapter.engine.ID(core.PK{owner, skillName, name}).Delete(&BrowserUseWebAction{})
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}
