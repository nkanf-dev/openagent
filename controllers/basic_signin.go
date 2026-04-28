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
	"sort"
	"sync/atomic"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/the-open-agent/openagent/object"
	"github.com/the-open-agent/openagent/util"
)

var casdoorAvailable atomic.Bool

func setCasdoorAvailable(available bool) {
	casdoorAvailable.Store(available)
}

func isCasdoorAvailable() bool {
	return casdoorAvailable.Load()
}

type basicSigninForm struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type accountForm struct {
	DisplayName     string `json:"displayName"`
	Email           string `json:"email"`
	Avatar          string `json:"avatar"`
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// GetSigninOptions
// @Title GetSigninOptions
// @Tag Account API
// @Description get signin options
// @Success 200 {object} controllers.Response The Response object
// @router /get-signin-options [get]
func (c *ApiController) GetSigninOptions() {
	c.ResponseOk(map[string]interface{}{
		"casdoorAvailable":   isCasdoorAvailable(),
		"basicSigninEnabled": object.IsBasicSigninEnabled(),
	})
}

func (c *ApiController) requireCasdoorAvailable() bool {
	if !isCasdoorAvailable() {
		c.ResponseError(c.T("auth:Casdoor is unavailable"))
		return false
	}
	return true
}

func (c *ApiController) responseBasicOrganizationUsers() bool {
	sessionUser := c.GetSessionUser()
	if sessionUser == nil || sessionUser.Owner != object.BasicUserOwner {
		return false
	}

	users, err := object.GetBasicUsers()
	if err != nil {
		c.ResponseError(err.Error())
		return true
	}

	out := []organizationUser{}
	for _, u := range users {
		if u == nil || u.IsDeleted || u.IsForbidden {
			continue
		}
		out = append(out, organizationUser{
			Name:        u.RuntimeName,
			DisplayName: u.DisplayName,
			Avatar:      u.Avatar,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		a := out[i].DisplayName
		if a == "" {
			a = out[i].Name
		}
		b := out[j].DisplayName
		if b == "" {
			b = out[j].Name
		}
		return a < b
	})
	c.ResponseOk(out)
	return true
}

// UpdateAccount
// @Title UpdateAccount
// @Tag Account API
// @Description update account
// @Param body body accountForm true "The account details"
// @Success 200 {object} controllers.Response The Response object
// @router /update-account [post]
func (c *ApiController) UpdateAccount() {
	sessionUser := c.GetSessionUser()
	if sessionUser == nil || sessionUser.Owner != object.BasicUserOwner {
		c.ResponseError(c.T("auth:Unauthorized operation"))
		return
	}

	form := accountForm{}
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &form); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if form.CurrentPassword != "" || form.NewPassword != "" {
		if sanitizedBody, err := json.Marshal(accountForm{DisplayName: form.DisplayName, Email: form.Email, Avatar: form.Avatar, CurrentPassword: "***", NewPassword: "***"}); err == nil {
			c.Ctx.Input.RequestBody = sanitizedBody
		}
	}

	basicUser, err := object.GetBasicUserByRuntimeName(sessionUser.Name)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if basicUser == nil {
		c.ResponseError(c.T("auth:Unauthorized operation"))
		return
	}

	if form.NewPassword != "" && !object.CheckBasicUserPassword(basicUser, form.CurrentPassword) {
		c.ResponseError(c.T("auth:Invalid username or password"))
		return
	}

	basicUser.DisplayName = form.DisplayName
	basicUser.Email = form.Email
	basicUser.Avatar = form.Avatar
	if err = object.UpdateBasicUserProfile(basicUser); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if form.NewPassword != "" {
		if err = object.UpdateBasicUserPassword(basicUser, form.NewPassword); err != nil {
			c.ResponseError(err.Error())
			return
		}
	}

	user := basicUser.ToCasdoorUser()
	c.SetSessionUser(&user)
	c.ResponseOk(user)
}

func (c *ApiController) signinBasic() {
	if !object.IsBasicSigninEnabled() {
		c.ResponseError(c.T("auth:Basic login is disabled"))
		return
	}

	form := basicSigninForm{}
	if len(c.Ctx.Input.RequestBody) > 0 {
		if err := json.Unmarshal(c.Ctx.Input.RequestBody, &form); err != nil {
			c.ResponseError(err.Error())
			return
		}
	}
	if form.Username == "" {
		form.Username = c.Input().Get("username")
	}
	if form.Password == "" {
		form.Password = c.Input().Get("password")
	}
	if sanitizedBody, err := json.Marshal(basicSigninForm{Username: form.Username, Password: "***"}); err == nil {
		c.Ctx.Input.RequestBody = sanitizedBody
	}

	basicUser, ok, err := object.VerifyBasicUser(form.Username, form.Password, c.getClientIp(), c.GetAcceptLanguage())
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if !ok {
		c.ResponseError(c.T("auth:Invalid username or password"))
		return
	}

	user := basicUser.ToCasdoorUser()
	claims := &casdoorsdk.Claims{
		User:         user,
		SigninMethod: "Basic Sign In",
	}

	if err = c.addInitialChatAndMessage(&claims.User); err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.SetSessionClaims(claims)
	userId := util.GetIdFromOwnerAndName(claims.User.Owner, claims.User.Name)
	c.Ctx.Input.SetParam("recordUserId", userId)

	sessionId := c.Ctx.Input.CruSession.SessionID()
	if sessionId != "" && userId != "" {
		session := &object.Session{
			Owner:     claims.User.Owner,
			Name:      claims.User.Name,
			SessionId: []string{sessionId},
		}

		object.AddSession(session)
	}

	c.ResponseOk(claims)
}
