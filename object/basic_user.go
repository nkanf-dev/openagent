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
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/the-open-agent/openagent/conf"
	"github.com/the-open-agent/openagent/i18n"
	"github.com/the-open-agent/openagent/util"
	"golang.org/x/crypto/bcrypt"
	"xorm.io/core"
)

const (
	BasicUserOwner                    = "basic"
	defaultBasicSigninFailedLimit     = 5
	defaultBasicSigninFrozenTime      = 15
	maxBasicSigninPasswordLengthBytes = 72
	unknownBasicUserPasswordHash      = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
)

type BasicUser struct {
	Owner       string `xorm:"varchar(100) notnull pk" json:"owner"`
	Name        string `xorm:"varchar(100) notnull pk" json:"name"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`
	UpdatedTime string `xorm:"varchar(100)" json:"updatedTime"`

	RuntimeName string `xorm:"varchar(100) index" json:"runtimeName"`
	DisplayName string `xorm:"varchar(100)" json:"displayName"`
	Avatar      string `xorm:"text" json:"avatar"`
	Email       string `xorm:"varchar(100)" json:"email"`
	Homepage    string `xorm:"varchar(100)" json:"homepage"`

	PasswordHash string `xorm:"varchar(150)" json:"-"`
	IsForbidden  bool   `json:"isForbidden"`
	IsDeleted    bool   `json:"isDeleted"`

	LastSigninTime      string `xorm:"varchar(100)" json:"lastSigninTime"`
	LastSigninIp        string `xorm:"varchar(100)" json:"lastSigninIp"`
	LastSigninWrongTime string `xorm:"varchar(100)" json:"lastSigninWrongTime"`
	SigninWrongTimes    int    `json:"signinWrongTimes"`
}

func IsBasicSigninEnabled() bool {
	return conf.GetConfigString("basicSigninEnabled") == "true"
}

func GetBasicRuntimeName(name string) string {
	name = strings.TrimSpace(name)
	sum := sha256.Sum256([]byte(name))
	hash := hex.EncodeToString(sum[:])[:8]

	return fmt.Sprintf("b-%s", hash)
}

func normalizeBasicUserName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("username cannot be empty")
	}
	if strings.Contains(name, "/") {
		return "", fmt.Errorf("username cannot contain slash")
	}
	if len(name) > 100 {
		return "", fmt.Errorf("username is too long")
	}
	return name, nil
}

func getBasicPasswordHash(password string) (string, error) {
	if password == "" {
		return "", fmt.Errorf("password cannot be empty")
	}
	if len([]byte(password)) > maxBasicSigninPasswordLengthBytes {
		return "", fmt.Errorf("password cannot be longer than %d bytes", maxBasicSigninPasswordLengthBytes)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func (user *BasicUser) GetId() string {
	return util.GetIdFromOwnerAndName(user.Owner, user.Name)
}

func (user *BasicUser) ToCasdoorUser() casdoorsdk.User {
	displayName := user.DisplayName
	if displayName == "" {
		displayName = user.Name
	}

	return casdoorsdk.User{
		Owner:       BasicUserOwner,
		Name:        user.RuntimeName,
		CreatedTime: user.CreatedTime,
		UpdatedTime: user.UpdatedTime,
		Id:          user.RuntimeName,
		IsAdmin:     true,
		DisplayName: displayName,
		Avatar:      user.Avatar,
		Email:       user.Email,
		Homepage:    user.Homepage,
		IsForbidden: user.IsForbidden,
		IsDeleted:   user.IsDeleted,

		LastSigninTime:      user.LastSigninTime,
		LastSigninIp:        user.LastSigninIp,
		LastSigninWrongTime: user.LastSigninWrongTime,
		SigninWrongTimes:    user.SigninWrongTimes,
	}
}

func GetBasicUser(name string) (*BasicUser, error) {
	name, err := normalizeBasicUserName(name)
	if err != nil {
		return nil, err
	}

	user := BasicUser{Owner: BasicUserOwner, Name: name}
	existed, err := adapter.engine.Get(&user)
	if err != nil {
		return nil, err
	}
	if !existed {
		return nil, nil
	}
	return &user, nil
}

func GetBasicUserByRuntimeName(runtimeName string) (*BasicUser, error) {
	if runtimeName == "" {
		return nil, nil
	}

	user := BasicUser{Owner: BasicUserOwner, RuntimeName: runtimeName}
	existed, err := adapter.engine.Get(&user)
	if err != nil {
		return nil, err
	}
	if !existed {
		return nil, nil
	}
	return &user, nil
}

func GetBasicUsers() ([]*BasicUser, error) {
	users := []*BasicUser{}
	err := adapter.engine.Asc("name").Find(&users, &BasicUser{Owner: BasicUserOwner})
	if err != nil {
		return users, err
	}
	return users, nil
}

func AddBasicUser(user *BasicUser, password string) (bool, error) {
	name, err := normalizeBasicUserName(user.Name)
	if err != nil {
		return false, err
	}

	user.Owner = BasicUserOwner
	user.Name = name
	user.RuntimeName = GetBasicRuntimeName(name)
	user.CreatedTime = util.GetCurrentTime()
	user.UpdatedTime = user.CreatedTime
	user.PasswordHash, err = getBasicPasswordHash(password)
	if err != nil {
		return false, err
	}

	affected, err := adapter.engine.Insert(user)
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}

func getBasicSigninFailedLimit() int {
	res := conf.GetConfigInt("basicSigninFailedSigninLimit")
	if res <= 0 {
		return defaultBasicSigninFailedLimit
	}
	return res
}

func getBasicSigninFrozenTime() int {
	res := conf.GetConfigInt("basicSigninFailedSigninFrozenTime")
	if res <= 0 {
		return defaultBasicSigninFrozenTime
	}
	return res
}

func updateBasicUserSigninFields(user *BasicUser, fields []string) error {
	_, err := adapter.engine.ID(core.PK{user.Owner, user.Name}).Cols(fields...).Update(user)
	return err
}

func UpdateBasicUserProfile(user *BasicUser) error {
	user.UpdatedTime = util.GetCurrentTime()
	_, err := adapter.engine.ID(core.PK{user.Owner, user.Name}).Cols("display_name", "avatar", "email", "updated_time").Update(user)
	return err
}

func UpdateBasicUserPassword(user *BasicUser, password string) error {
	passwordHash, err := getBasicPasswordHash(password)
	if err != nil {
		return err
	}

	user.PasswordHash = passwordHash
	user.UpdatedTime = util.GetCurrentTime()
	_, err = adapter.engine.ID(core.PK{user.Owner, user.Name}).Cols("password_hash", "updated_time").Update(user)
	return err
}

func CheckBasicUserPassword(user *BasicUser, password string) bool {
	if user == nil || len([]byte(password)) > maxBasicSigninPasswordLengthBytes {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) == nil
}

func checkBasicSigninErrorTimes(user *BasicUser, lang string) error {
	failedSigninLimit := getBasicSigninFailedLimit()
	failedSigninFrozenTime := getBasicSigninFrozenTime()
	if user.SigninWrongTimes < failedSigninLimit {
		return nil
	}

	lastSignWrongTime, _ := time.Parse(time.RFC3339, user.LastSigninWrongTime)
	passedTime := time.Now().UTC().Sub(lastSignWrongTime)
	minutes := failedSigninFrozenTime - int(passedTime.Minutes())
	if minutes > 0 {
		return fmt.Errorf(i18n.Translate(lang, "auth:You have entered the wrong password too many times, please wait for %d minutes and try again"), minutes)
	}

	user.SigninWrongTimes = 0
	return updateBasicUserSigninFields(user, []string{"signin_wrong_times"})
}

func recordBasicSigninErrorInfo(user *BasicUser) error {
	failedSigninLimit := getBasicSigninFailedLimit()
	if user.SigninWrongTimes < failedSigninLimit {
		user.SigninWrongTimes++
	}
	if user.SigninWrongTimes >= failedSigninLimit {
		user.LastSigninWrongTime = time.Now().UTC().Format(time.RFC3339)
	}

	return updateBasicUserSigninFields(user, []string{"signin_wrong_times", "last_signin_wrong_time"})
}

func resetBasicSigninErrorTimes(user *BasicUser, clientIp string) error {
	user.SigninWrongTimes = 0
	user.LastSigninWrongTime = ""
	user.LastSigninTime = util.GetCurrentTime()
	user.LastSigninIp = clientIp
	return updateBasicUserSigninFields(user, []string{"signin_wrong_times", "last_signin_wrong_time", "last_signin_time", "last_signin_ip"})
}

func compareUnknownBasicUserPassword(password string) {
	if len([]byte(password)) <= maxBasicSigninPasswordLengthBytes {
		_ = bcrypt.CompareHashAndPassword([]byte(unknownBasicUserPasswordHash), []byte(password))
	}
}

func VerifyBasicUser(username string, password string, clientIp string, lang string) (*BasicUser, bool, error) {
	user, err := GetBasicUser(username)
	if err != nil {
		compareUnknownBasicUserPassword(password)
		return nil, false, nil
	}
	if user == nil || user.IsDeleted || user.IsForbidden || user.PasswordHash == "" {
		compareUnknownBasicUserPassword(password)
		return nil, false, nil
	}

	if err = checkBasicSigninErrorTimes(user, lang); err != nil {
		return nil, false, err
	}
	if len([]byte(password)) > maxBasicSigninPasswordLengthBytes || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		if err = recordBasicSigninErrorInfo(user); err != nil {
			return nil, false, err
		}
		return nil, false, nil
	}

	if err = resetBasicSigninErrorTimes(user, clientIp); err != nil {
		return nil, false, err
	}
	return user, true, nil
}

func InitBasicUsers() {
	if !IsBasicSigninEnabled() {
		return
	}

	password := conf.GetConfigString("basicSigninDefaultPassword")
	if password == "" {
		return
	}

	username := conf.GetConfigString("basicSigninDefaultUsername")
	if username == "" {
		username = "admin"
	}

	user, err := GetBasicUser(username)
	if err != nil {
		panic(err)
	}
	if user != nil {
		return
	}

	displayName := conf.GetConfigString("basicSigninDefaultDisplayName")
	if displayName == "" {
		displayName = "Admin"
	}

	_, err = AddBasicUser(&BasicUser{
		Name:        username,
		DisplayName: displayName,
	}, password)
	if err != nil {
		panic(err)
	}
}
