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

package model

type KimiCodingModelProvider struct {
	*LocalModelProvider
}

const (
	kimiCodingBaseURL   = "https://api.kimi.com/coding/v1"
	kimiCodingModelName = "kimi-for-coding"
)

func NewKimiCodingModelProvider(secretKey string, temperature float32, topP float32) (*KimiCodingModelProvider, error) {
	localProvider, err := NewLocalModelProvider("Custom-think", "custom-model", secretKey, temperature, topP, 0, 0, kimiCodingBaseURL, kimiCodingModelName, 0, 0, "CNY")
	if err != nil {
		return nil, err
	}

	localProvider.requestHeaders = map[string]string{
		"User-Agent": "claude-code/1.0",
	}

	return &KimiCodingModelProvider{
		LocalModelProvider: localProvider,
	}, nil
}

func (p *KimiCodingModelProvider) GetPricing() string {
	return `URL:
https://www.kimi.com/help/kimi-code/benefits

Kimi Code usage is included in the subscription plan and does not have separate per-token billing.
`
}

func (p *KimiCodingModelProvider) ListModels() ([]string, error) {
	return []string{kimiCodingModelName}, nil
}
