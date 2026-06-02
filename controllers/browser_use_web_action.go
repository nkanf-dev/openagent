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

package controllers

import (
	"encoding/json"
	"strings"

	"github.com/the-open-agent/openagent/tool"
)

func (c *ApiController) requireBrowserUseWebActionAccess() bool {
	if c.IsAdmin() || strings.TrimSpace(c.GetSessionUsername()) != "" {
		return true
	}
	if err := tool.ValidateChromeExtensionRequest(c.Ctx.Request); err != nil {
		c.ResponseError(err.Error())
		return false
	}
	return true
}

func browserUseWebActionResponse(action tool.BrowserUseWebActionData) map[string]interface{} {
	steps := []interface{}{}
	response := map[string]interface{}{
		"action_group": action.ActionGroup,
		"name":         action.Name,
		"url":          action.URL,
		"description":  browserUseWebActionDescription(action.Action),
		"action":       action.Action,
		"script":       action.Script,
		"updated_time": action.UpdatedTime,
	}
	if strings.TrimSpace(action.Script) != "" {
		if err := json.Unmarshal([]byte(action.Script), &steps); err != nil {
			response["steps_parse_error"] = err.Error()
			return response
		}
	}
	response["steps"] = steps
	return response
}

func browserUseWebActionArgumentOwner(arguments map[string]interface{}) string {
	owner, _ := arguments["owner"].(string)
	return strings.TrimSpace(owner)
}

func (c *ApiController) browserUseWebActionOwner(arguments map[string]interface{}) (string, bool) {
	requestedOwner := strings.TrimSpace(c.Input().Get("owner"))
	if requestedOwner == "" {
		requestedOwner = browserUseWebActionArgumentOwner(arguments)
	}

	if c.IsAdmin() {
		if requestedOwner != "" {
			return requestedOwner, true
		}
		return "admin", true
	}

	if username := strings.TrimSpace(c.GetSessionUsername()); username != "" {
		if requestedOwner != "" && requestedOwner != username {
			c.ResponseError("requested owner does not match the current user")
			return "", false
		}
		return username, true
	}

	if err := tool.ValidateChromeExtensionRequest(c.Ctx.Request); err == nil {
		owner := tool.ChromeExtensionOwner()
		if requestedOwner != "" && requestedOwner != owner {
			c.ResponseError("requested owner does not match the Chrome extension owner")
			return "", false
		}
		return owner, true
	}

	c.ResponseError("browser web action owner is unavailable")
	return "", false
}

func browserUseWebActionDescription(action string) string {
	action = strings.TrimSpace(action)
	if action == "" {
		return ""
	}
	if index := strings.Index(action, "\n## Steps"); index >= 0 {
		return strings.TrimSpace(action[:index])
	}
	if strings.HasPrefix(action, "## Steps") {
		return ""
	}
	return action
}

func browserUseWebActionsResponse(actions []tool.BrowserUseWebActionData) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(actions))
	for _, action := range actions {
		result = append(result, browserUseWebActionResponse(action))
	}
	return result
}

// GetBrowserUseWebActions lists browser web actions, optionally filtered by URL.
// @Title GetBrowserUseWebActions
// @Tag Tool API
// @Description list executable browser web actions
// @Param action_group query string false "Action group"
// @Param name query string false "Action name"
// @Param url query string false "Current page URL for same-site matching"
// @Success 200 {object} controllers.Response The Response object
// @router /get-browser-use-web-actions [get]
func (c *ApiController) GetBrowserUseWebActions() {
	if !c.requireBrowserUseWebActionAccess() {
		return
	}
	owner, ok := c.browserUseWebActionOwner(nil)
	if !ok {
		return
	}

	actions, err := tool.ListBrowserUseWebActions(owner, tool.BrowserUseWebActionFilter{
		ActionGroup: c.Input().Get("action_group"),
		Name:        c.Input().Get("name"),
		URL:         c.Input().Get("url"),
	})
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(browserUseWebActionsResponse(actions))
}

// GetBrowserUseWebAction gets one browser web action.
// @Title GetBrowserUseWebAction
// @Tag Tool API
// @Description get an executable browser web action
// @Param action_group query string false "Action group"
// @Param name query string true "Action name"
// @Success 200 {object} controllers.Response The Response object
// @router /get-browser-use-web-action [get]
func (c *ApiController) GetBrowserUseWebAction() {
	if !c.requireBrowserUseWebActionAccess() {
		return
	}
	owner, ok := c.browserUseWebActionOwner(nil)
	if !ok {
		return
	}

	action, err := tool.GetBrowserUseWebAction(owner, c.Input().Get("action_group"), c.Input().Get("name"))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(browserUseWebActionResponse(action))
}

// SaveBrowserUseWebAction saves a Chrome-extension-recorded browser web action.
// @Title SaveBrowserUseWebAction
// @Tag Tool API
// @Description save an executable browser web action recorded by the Chrome extension
// @Param body body object true "Browser web action payload: {\"action_group\":\"site\",\"name\":\"action_name\",\"url\":\"https://example.com\",\"steps\":[...]}"
// @Success 200 {object} controllers.Response The Response object
// @router /save-browser-use-web-action [post]
func (c *ApiController) SaveBrowserUseWebAction() {
	if !c.requireBrowserUseWebActionAccess() {
		return
	}

	arguments := map[string]interface{}{}
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &arguments); err != nil {
		c.ResponseError(err.Error())
		return
	}
	owner, ok := c.browserUseWebActionOwner(arguments)
	if !ok {
		return
	}

	action, stepCount, err := tool.SaveBrowserUseWebAction(owner, arguments)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(map[string]interface{}{
		"action":    browserUseWebActionResponse(action),
		"stepCount": stepCount,
	})
}

// DeleteBrowserUseWebAction deletes one browser web action.
// @Title DeleteBrowserUseWebAction
// @Tag Tool API
// @Description delete an executable browser web action
// @Param body body object true "Browser web action identity: {\"action_group\":\"site\",\"name\":\"action_name\"}"
// @Success 200 {object} controllers.Response The Response object
// @router /delete-browser-use-web-action [post]
func (c *ApiController) DeleteBrowserUseWebAction() {
	if !c.requireBrowserUseWebActionAccess() {
		return
	}

	arguments := map[string]interface{}{}
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &arguments); err != nil {
		c.ResponseError(err.Error())
		return
	}
	owner, ok := c.browserUseWebActionOwner(arguments)
	if !ok {
		return
	}

	actionGroup, _ := arguments["action_group"].(string)
	if strings.TrimSpace(actionGroup) == "" {
		actionGroup, _ = arguments["actionGroup"].(string)
	}
	name, _ := arguments["name"].(string)
	action, deleted, err := tool.DeleteBrowserUseWebAction(owner, actionGroup, name)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(map[string]interface{}{
		"deleted": deleted,
		"action":  browserUseWebActionResponse(action),
	})
}
