# GPTSL for Copilot Chat

Connect GPTSL AI Gateway models to VS Code Copilot Chat and monitor API key usage directly from the status bar.

![GPTSL for Copilot Chat](https://imgs.react.mobi/FtU7uGQU7WKMLKuLzSJkWTtGIt1Y.png)

## Overview

`GPTSL for Copilot Chat` is a VS Code extension that registers GPTSL AI Gateway models as selectable Copilot Chat model providers. After configuring the API key and gateway base URL, you can select GPTSL models in Copilot Chat contexts that support third-party Language Model Providers.

The extension also provides status bar usage monitoring, making it easy to view current spend, budget, and usage percentage for the configured API key.

## Features

- **Copilot Chat model provider**: Register GPTSL as a VS Code Language Model Chat Provider.
- **Multiple request modes**: Support both `openai-responses` and `anthropic` gateway request formats.
- **Configurable model list**: Customize model ID, context length, max output tokens, vision support, and temperature.
- **Shared API key**: Use the same API key for chat requests and usage queries.
- **Status bar usage display**: Show API key usage as either a percentage or current spend amount.
- **Detailed usage hover**: View spend, budget, progress bar, key information, and last updated time.
- **Quick commands**: Open settings, refresh usage, and toggle the usage display mode.

## Quick Start

1. Install the extension and open the VS Code Command Palette.
2. Run `GPTSL: Open Settings`.
3. Configure `gptslForCopilotChat.apiKey`.
4. Configure `gptslForCopilotChat.baseUrl`.
5. Adjust `gptslForCopilotChat.models` if needed.
6. Select a GPTSL model from the Copilot Chat model picker.

## Settings

| Setting | Description |
| --- | --- |
| `gptslForCopilotChat.apiKey` | Bearer token used to call GPTSL AI Gateway. |
| `gptslForCopilotChat.baseUrl` | Global gateway base URL shared by all models. |
| `gptslForCopilotChat.models` | Model configuration list used by Copilot Chat. |
| `gptslForCopilotChat.usageDisplayMode` | Status bar usage display mode. Use `percentage` or `amount`. |

> Compatibility note: the extension still reads the legacy `gptsl.apiKey` setting as a fallback API key source.

## Commands

| Command | Description |
| --- | --- |
| `GPTSL: Open Settings` | Open GPTSL settings and prompt for an API key when missing. |
| `GPTSL: Refresh Usage` | Refresh API key usage information in the status bar. |
| `GPTSL: Toggle Usage Display Mode` | Switch between percentage and amount display modes. |

## Model Configuration

`gptslForCopilotChat.models` is an array of model objects.

Supported fields:

- `id`: model identifier sent to the gateway.
- `apiMode`: request format. Use `openai-responses` or `anthropic`.
- `owned_by`: optional model owner label.
- `configId`: optional internal configuration identifier.
- `context_length`: maximum input context tokens.
- `max_tokens`: maximum output tokens.
- `vision`: whether the model supports image input.
- `temperature`: optional sampling temperature.

Example:

```json
[
  {
    "id": "GPT5.5",
    "context_length": 1000000,
    "max_tokens": 128000,
    "vision": true,
    "apiMode": "openai-responses",
    "temperature": 0
  },
  {
    "id": "claude-sonnet-4-6",
    "context_length": 200000,
    "max_tokens": 40960,
    "vision": true,
    "apiMode": "anthropic"
  }
]
```

## Usage Display

The status bar shows API key usage as a percentage by default. You can also switch it to show the current spend amount.

Hover over the status bar item to view:

- Current spend
- Budget limit
- Usage percentage
- Text progress bar
- Current display mode
- Key name
- Key alias
- Parsed user name
- Last updated time

The usage endpoint is built by appending `/key/info` to `gptslForCopilotChat.baseUrl`. If the base URL ends with a version suffix such as `/v1`, the extension automatically removes the version suffix before building the usage query URL.

The request sends the configured API key in both places:

- `key` query parameter
- `api-key` request header

When the endpoint does not return a global budget, the extension reads model-level budget limits and uses the largest budget value to calculate the status bar percentage.

## Development

```sh
npm install
npm run compile
```

Press `F5` in VS Code to start an Extension Development Host for debugging.

## Privacy

This extension does not store or collect any user information in any form.

## License

MIT
