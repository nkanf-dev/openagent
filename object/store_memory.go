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
	"context"
	"fmt"
	"strings"

	"github.com/ThinkInAIXYZ/go-mcp/protocol"
	"github.com/the-open-agent/openagent/i18n"
	"github.com/the-open-agent/openagent/tool"
	"github.com/the-open-agent/openagent/util"
)

const storeMemoryPrefix = "Store memory: "

func normalizeStoreMemoryText(content string) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}
	if strings.HasPrefix(content, storeMemoryPrefix) {
		return content
	}
	return storeMemoryPrefix + content
}

func AddStoreMemory(store *Store, content string, lang string) (*Vector, error) {
	if store == nil {
		return nil, fmt.Errorf(i18n.Translate(lang, "object:The store should not be empty"))
	}

	text := normalizeStoreMemoryText(content)
	if text == "" {
		return nil, fmt.Errorf(i18n.Translate(lang, "object:The memory content should not be empty"))
	}

	embeddingProviderName := store.EmbeddingProvider
	if embeddingProviderName == "" {
		embeddingProvider, _, err := GetEmbeddingProviderFromContext(store.Owner, "", lang)
		if err != nil {
			return nil, err
		}
		if embeddingProvider == nil {
			return nil, fmt.Errorf(i18n.Translate(lang, "object:Please add an embedding provider first"))
		}
		embeddingProviderName = embeddingProvider.Name
	}

	embeddingProvider, embeddingProviderObj, err := getEmbeddingProviderFromName(store.Owner, embeddingProviderName, lang)
	if err != nil {
		return nil, err
	}

	data, embeddingResult, err := queryVectorSafe(embeddingProviderObj, text, embeddingProvider.Name, lang)
	if err != nil {
		return nil, err
	}

	existingMemories, err := getMemoryVectors(store.Owner, store.Name)
	if err == nil {
		dataNorm := norm(data)
		for _, v := range existingMemories {
			if len(v.Data) != len(data) {
				continue
			}
			if cosineSimilarity(data, v.Data, dataNorm) > 0.95 {
				if _, delErr := DeleteVector(v); delErr != nil {
					return nil, delErr
				}
			}
		}
	}

	displayName := text
	if len([]rune(displayName)) > 40 {
		displayName = string([]rune(displayName)[:40])
	}

	tokenCount := 0
	price := 0.0
	currency := ""
	if embeddingResult != nil {
		tokenCount = embeddingResult.TokenCount
		price = embeddingResult.Price
		currency = embeddingResult.Currency
	}

	vector := &Vector{
		Owner:       store.Owner,
		Name:        fmt.Sprintf("vector_memory_%s", util.GetRandomName()),
		CreatedTime: util.GetCurrentTime(),
		DisplayName: displayName,
		Store:       store.Name,
		Provider:    embeddingProvider.Name,
		File:        "__store_memory__",
		Index:       0,
		Text:        text,
		TokenCount:  tokenCount,
		Price:       price,
		Currency:    currency,
		Data:        data,
		Dimension:   len(data),
	}

	_, err = AddVector(vector)
	if err != nil {
		return nil, err
	}

	return vector, nil
}

func NewStoreMemoryBuiltin(store *Store, lang string) tool.BuiltinTool {
	if store == nil {
		return nil
	}
	if store.EmbeddingProvider == "" {
		embeddingProvider, _, err := GetEmbeddingProviderFromContext(store.Owner, "", lang)
		if err != nil || embeddingProvider == nil {
			return nil
		}
	}
	return &storeMemoryBuiltin{store: store, lang: lang}
}

type storeMemoryBuiltin struct {
	store *Store
	lang  string
}

func (t *storeMemoryBuiltin) GetName() string {
	return "store_memory"
}

func (t *storeMemoryBuiltin) GetDescription() string {
	return "Save an important long-term memory for the current store so it can be retrieved later through the store's existing RAG knowledge retrieval. Use this for stable preferences, conventions, or facts worth remembering for future conversations in this store."
}

func (t *storeMemoryBuiltin) GetInputSchema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"content": map[string]interface{}{
				"type":        "string",
				"description": "The memory to save for this store. Write it as a clear enduring fact or preference.",
			},
		},
		"required": []string{"content"},
	}
}

func (t *storeMemoryBuiltin) Execute(_ context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	if t.store == nil {
		return storeMemoryToolError("store context is missing"), nil
	}

	content, _ := arguments["content"].(string)
	content = strings.TrimSpace(content)
	if content == "" {
		return storeMemoryToolError("missing required parameter: content"), nil
	}

	vector, err := AddStoreMemory(t.store, content, t.lang)
	if err != nil {
		return storeMemoryToolError(err.Error()), nil
	}

	return storeMemoryToolText(fmt.Sprintf("saved store memory for %s: %s", t.store.Name, vector.Text)), nil
}

func storeMemoryToolText(text string) *protocol.CallToolResult {
	return &protocol.CallToolResult{
		IsError: false,
		Content: []protocol.Content{
			&protocol.TextContent{Type: "text", Text: text},
		},
	}
}

func storeMemoryToolError(text string) *protocol.CallToolResult {
	return &protocol.CallToolResult{
		IsError: true,
		Content: []protocol.Content{
			&protocol.TextContent{Type: "text", Text: text},
		},
	}
}
