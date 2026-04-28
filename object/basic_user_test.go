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
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestGetBasicRuntimeName(t *testing.T) {
	name := GetBasicRuntimeName("Admin")
	if !strings.HasPrefix(name, "b-") || len(name) != 10 {
		t.Fatalf("expected runtime name with b- prefix, got %s", name)
	}
	if name == "admin" {
		t.Fatal("runtime name should not reuse the login username")
	}
	if name != GetBasicRuntimeName(" Admin ") {
		t.Fatal("runtime name should be stable for normalized usernames")
	}
	if name == GetBasicRuntimeName("admin") {
		t.Fatal("runtime name should keep case-distinct login names isolated")
	}
}

func TestNormalizeBasicUserName(t *testing.T) {
	if _, err := normalizeBasicUserName(""); err == nil {
		t.Fatal("empty username should be rejected")
	}
	if _, err := normalizeBasicUserName("a/b"); err == nil {
		t.Fatal("slash should be rejected")
	}
	if _, err := normalizeBasicUserName(strings.Repeat("a", 101)); err == nil {
		t.Fatal("long username should be rejected")
	}
	if name, err := normalizeBasicUserName(" admin "); err != nil || name != "admin" {
		t.Fatalf("expected trimmed username, got %q, err=%v", name, err)
	}
}

func TestGetBasicPasswordHash(t *testing.T) {
	hash, err := getBasicPasswordHash("secret")
	if err != nil {
		t.Fatal(err)
	}
	if err = bcrypt.CompareHashAndPassword([]byte(hash), []byte("secret")); err != nil {
		t.Fatal(err)
	}
	if err = bcrypt.CompareHashAndPassword([]byte(hash), []byte("wrong")); err == nil {
		t.Fatal("wrong password should not match")
	}
	if _, err = getBasicPasswordHash(strings.Repeat("a", maxBasicSigninPasswordLengthBytes+1)); err == nil {
		t.Fatal("password longer than bcrypt input limit should be rejected")
	}
}
