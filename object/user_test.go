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

func TestNormalizeUserName(t *testing.T) {
	if _, err := normalizeUserName(""); err == nil {
		t.Fatal("empty username should be rejected")
	}
	if _, err := normalizeUserName("a/b"); err == nil {
		t.Fatal("slash should be rejected")
	}
	if _, err := normalizeUserName(strings.Repeat("a", 101)); err == nil {
		t.Fatal("long username should be rejected")
	}
	if name, err := normalizeUserName(" admin "); err != nil || name != "admin" {
		t.Fatalf("expected trimmed username, got %q, err=%v", name, err)
	}
}

func TestGetPasswordHash(t *testing.T) {
	hash, err := getPasswordHash("secret")
	if err != nil {
		t.Fatal(err)
	}
	if err = bcrypt.CompareHashAndPassword([]byte(hash), []byte("secret")); err != nil {
		t.Fatal(err)
	}
	if err = bcrypt.CompareHashAndPassword([]byte(hash), []byte("wrong")); err == nil {
		t.Fatal("wrong password should not match")
	}
	if _, err = getPasswordHash(strings.Repeat("a", maxPasswordLengthBytes+1)); err == nil {
		t.Fatal("password longer than bcrypt input limit should be rejected")
	}
}
