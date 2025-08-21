# Squad Leader Whitelist Plugin

**SquadJS Plugin for Progressive Whitelisting**

## Overview

This plugin manages a progressive whitelist for squad leaders. It uses a SQLite database for persistent storage of player whitelist progress.

It automatically tracks eligible squad leaders, awards them progressive whitelist credit over time, and handles the decay of this progress. The plugin also generates the `admin_whitelist.txt` file based on a configurable threshold.

Players can check their own progress in-game using a chat command. All admin-facing functionality is designed to be handled by a separate Discord bot.

## Core Features

* **Persistent Progress**: Stores player whitelist progress using SQLite.
* **Automatic Tracking**: Automatically tracks eligible squad leaders and awards credit.
* **Progress Decay**: Handles the decay of whitelist progress over time.
* **Automatic File Generation**: Generates the `admin_whitelist.txt` file on a set interval.
* **In-game Command**: Players can check their progress with the `!slwl` chat command.

## Installation

Add this to your `config.json` plugins array:

```json
{
    "plugin": "SquadLeaderWhitelist",
    "enabled": true,
    "database": "sqlite",
    "managedWhitelistPath": "SquadGame/ServerConfig/slwhitelist.cfg",
    "managedWhitelistGroup": "sl_whitelist",
    "threshold": 100,
    "progressPerHour": 50,
    "decayPerHour": 5,
    "decayIntervalSeconds": 1000,
    "decayAfterHours": 2,
    "minPlayersForDecay": 60,
    "minSquadMembers": 4,
    "onlyOpenSquads": true,
    "debugLogs": false,
    "whitelistUpdateMinutes": 30
}
```

And also add the `adminLists` to your `config.json`:

```json
"adminLists": [
    {
    "type": "local",
    "source": "SquadGame/ServerConfig/slwhitelist.cfg"
    }
]
```

## Commands

### Player

| Command | Description |
|---|---|
| `!slwl` | Shows your current whitelist progress and rank. |

## Configuration Options

| Key | Description | Default |
|---|---|---|
| `database` | The name of the database connector configured in `connectors`. | `sqlite` |
| `managedWhitelistPath` | The file path for the output whitelist file. | `SquadGame/ServerConfig/slwhitelist.cfg` |
| `managedWhitelistGroup` | The admin group name for whitelisted players. | `sl_whitelist` |
| `threshold` | The progress score required to be on the whitelist. | `100` |
| `progressPerHour` | Points awarded per hour to eligible squad leaders. | `50` |
| `decayPerHour` | Points to decay per hour for inactive players. | `5` |
| `decayIntervalSeconds` | Time in seconds between each decay tick. | `1000` |
| `decayAfterHours` | Number of hours after last progress gain to start decay. | `2` |
| `minPlayersForDecay` | Minimum number of players on the server for decay to be active. | `60` |
| `minSquadMembers` | Minimum squad size for a leader to be eligible. | `4` |
| `onlyOpenSquads` | Only award progress to leaders of unlocked squads. | `true` |
| `debugLogs` | Enables verbose debug logging. | `false` |
| `whitelistUpdateMinutes` | The interval in minutes to regenerate the whitelist file. | `30` |

## Author

**Slacker**
Discord: `real_slacker`
