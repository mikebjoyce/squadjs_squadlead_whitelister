import BasePlugin from './base-plugin.js';
import Sequelize from 'sequelize';
import path from 'path';
import fs from 'fs/promises';

const { DataTypes, Op } = Sequelize;

// A single source of truth for all events this plugin will handle.
const EVENTS = {
  PLAYER_POSSESS: 'PLAYER_POSSESS',
  UPDATED_PLAYER_INFORMATION: 'UPDATED_PLAYER_INFORMATION',
  CHAT_COMMAND_SLWL: 'CHAT_COMMAND:slwl',
  NEW_GAME: 'NEW_GAME',
  END_GAME: 'END_GAME' // Added END_GAME event for future consideration based on discussion
};

/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                SQUAD LEADER WHITELIST PLUGIN                  ║
 * ║             SquadJS Plugin for Progressive Whitelisting       ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * OVERVIEW:
 * This plugin manages a progressive whitelist for squad leaders. It uses a SQLite
 * database for persistent storage of player whitelist progress.
 *
 * It automatically tracks eligible squad leaders, awards them progressive whitelist
 * credit over time, and handles the decay of this progress. The plugin also
 * generates the `admin_whitelist.txt` file based on a configurable threshold.
 *
 * Players can check their own progress in-game using a chat command.
 *
 * CORE FEATURES:
 * - Persistent storage of player whitelist progress using SQLite.
 * - Automatic tracking of squad leaders meeting specific criteria.
 * - Progressive awarding of whitelist credit based on time.
 * - Decay of whitelist progress over time.
 * - Automatic generation of the `admin_whitelist.txt` file on a set interval.
 * - In-game player chat command `!slwl` to check progress and rank.
 *
 * DATABASE SCHEMA:
 * A `WhitelistProgress` model with the following fields:
 * - steamID: Unique identifier for each player (primary key).
 * - progress: The player's current whitelist progress score.
 * - lastProgressed: Timestamp of the player's last progress gain.
 *
 * INSTALLATION:
 * Add this to your `config.json` plugins array:
 *
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
 *
 * And also add the `adminLists` to your `config.json`:
 *
  ```json
  "adminLists": [
      {
      "type": "local",
      "source": "SquadGame/ServerConfig/slwhitelist.cfg"
      }
  ]
  ```
 *
 * CHAT COMMANDS:
 * !slwl → Shows your current whitelist progress and rank.
 *
 * CONFIGURATION OPTIONS (WITH DEFAULTS):
 *
 * database               - The name of the database connector configured in `connectors`.
 * Default: 'sqlite'
 * managedWhitelistPath   - The file path for the output whitelist file.
 * Default: 'SquadGame/ServerConfig/slwhitelist.cfg'
 * managedWhitelistGroup  - The name of the group to be assigned to whitelisted players.
 * Default: 'sl_whitelist'
 * threshold              - The progress score a player must reach to be included in the whitelist file.
 * Default: 100
 * progressPerHour        - The amount of progress to be awarded to eligible squad leaders per hour.
 * Default: 50
 * decayPerHour           - The amount of progress to be decayed from all players per hour.
 * Default: 5
 * decayIntervalSeconds   - The time in seconds between each progress decay tick.
 * Default: 1000
 * decayAfterHours        - The number of hours after a player's last progress gain to start applying decay.
 * Default: 2
 * minPlayersForDecay     - The minimum number of players on the server for decay to be active.
 * Default: 60
 * minSquadMembers        - The minimum number of members a squad must have for its leader to be eligible to earn progress.
 * Default: 4
 * onlyOpenSquads         - If true, only unlocked squads are eligible for progress.
 * Default: true
 * debugLogs              - Enables verbose debug logging to the server console.
 * Default: false
 * whitelistUpdateMinutes - The interval in minutes to generate the whitelist file.
 * Default: 30
 *
 * AUTHOR:
 * Slacker (Discord: real_slacker)
 *
 * ════════════════════════════════════════════════════════════════
 */

export default class SquadLeaderWhitelist extends BasePlugin {
  static get description() {
    return 'Tracks squad leaders and progressively adds them to a whitelist based on time spent leading.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      database: {
        required: true,
        connector: 'sequelize',
        description: 'The Sequelize connector for persistent data storage.',
        default: 'sqlite'
      },
      managedWhitelistPath: {
        default: 'SquadGame/ServerConfig/slwhitelist.cfg',
        type: 'string',
        description: 'Path for the generated whitelist file.'
      },
      managedWhitelistGroup: {
        default: 'sl_whitelist',
        type: 'string',
        description: 'The admin group name for whitelisted players.'
      },
      threshold: {
        default: 100,
        type: 'number',
        description: 'Progress score required to be on the whitelist.'
      },
      progressPerHour: {
        default: 50,
        type: 'number',
        description: 'Points awarded per hour to eligible SLs.'
      },
      decayPerHour: {
        default: 5,
        type: 'number',
        description: 'Points to decay per hour for inactive players.'
      },
      decayIntervalSeconds: {
        default: 1000,
        type: 'number',
        description: 'Time in seconds between decay ticks.'
      },
      decayAfterHours: {
        default: 2,
        type: 'number',
        description: 'Number of hours after last progress gain to start decay.'
      },
      minPlayersForDecay: {
        default: 60,
        type: 'number',
        description: 'Minimum number of players on the server for decay to be active.'
      },
      minSquadMembers: {
        default: 4,
        type: 'number',
        description: 'Minimum squad size for leader to be eligible.'
      },
      onlyOpenSquads: {
        default: true,
        type: 'boolean',
        description: 'Only award progress to leaders of unlocked squads.'
      },
      debugLogs: {
        default: false,
        type: 'boolean',
        description: 'Enables verbose debug logging.'
      },
      whitelistUpdateMinutes: {
        default: 30,
        type: 'number',
        description: 'The interval in minutes to regenerate the whitelist file.'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.debug = this.options.debugLogs;
    this.sequelize = this.options.database;
    this.WhitelistProgressModel = null;
    this.progressInterval = null;
    this.decayInterval = null;
    this.whitelistInterval = null; // New property to hold the whitelist generation interval.
  }

  // A single, consistent way to log messages with a debug prefix.
  logDebug(...args) {
    if (this.options && this.options.debugLogs) {
      console.log('[SLWhitelister]', ...args);
    }
  }

  async prepareToMount() {
    this.logDebug('Starting prepareToMount process.');
    this.logDebug('prepareToMount process completed.');
  }

  async mount() {
    this.logDebug('Starting mount process...');

    try {
      this.logDebug('Defining WhitelistProgressModel schema...');
      this.WhitelistProgressModel = this.sequelize.define(
        'WhitelistProgress',
        {
          steamID: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
          },
          progress: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
          },
          lastProgressed: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
          }
        },
        {
          timestamps: true
        }
      );

      this.logDebug('Syncing WhitelistProgress database table...');
      await this.WhitelistProgressModel.sync();
      this.logDebug('WhitelistProgress database table synced successfully.');

      this.logDebug('Adding event listeners for UPDATED_PLAYER_INFORMATION and CHAT_COMMAND_SLWL.');
      // Add event listeners.
      this.server.on(EVENTS.UPDATED_PLAYER_INFORMATION, this.onPlayerInformationUpdate.bind(this));
      this.server.on(EVENTS.CHAT_COMMAND_SLWL, this.onChatCommand.bind(this));
      this.logDebug('Event listeners added.');

      this.logDebug('Ensuring whitelist file exists and generating it on mount...');
      // Ensure the whitelist file exists and generate it on mount.
      await this.ensureWhitelistFileExists();
      await this.generateWhitelistFile();
      this.logDebug('Whitelist file existence and initial generation complete.');

      this.logDebug('Starting progress tracking, decay, and whitelist generation intervals...');
      // Start intervals for progress, decay, and whitelist generation.
      this.startProgressTracking();
      this.startDecayInterval();
      this.startWhitelistGenerationInterval(); // New method for timed generation.
      this.logDebug('All intervals started successfully.');
    } catch (error) {
      this.logDebug('[ERROR] Failed to mount plugin:', error);
      this.logDebug('Mount process failed due to an error.');
    }
  }

  async unmount() {
    this.logDebug('Starting unmount process...');
    this.logDebug('Removing event listeners...');
    this.server.removeListener(
      EVENTS.UPDATED_PLAYER_INFORMATION,
      this.onPlayerInformationUpdate.bind(this)
    );
    this.server.removeListener(EVENTS.CHAT_COMMAND_SLWL, this.onChatCommand.bind(this));
    this.logDebug('Event listeners removed.');

    this.logDebug('Clearing all intervals...');
    clearInterval(this.progressInterval);
    clearInterval(this.decayInterval);
    clearInterval(this.whitelistInterval); // Clear the new whitelist generation interval.
    this.logDebug('All intervals cleared.');
    this.logDebug('Plugin unmounted successfully.');
  }

  /**
   * Handles the `!slwl` chat command to show a player their progress.
   * @param {object} info - Chat command information.
   */
  async onChatCommand(info) {
    const steamID = info.player.steamID;
    this.logDebug(
      `Processing chat command from SteamID: ${steamID}. Player name: ${info.player.name}`
    );
    try {
      this.logDebug(`Searching for player progress for SteamID: ${steamID} in the database.`);
      const playerProgress = await this.WhitelistProgressModel.findOne({
        where: { steamID }
      });

      const header = '═════ SL WHITELIST ═════';
      const footer = '══════════════════════'; // Shortened footer

      if (playerProgress) {
        const currentProgress = playerProgress.progress;
        const threshold = this.options.threshold;
        const progressPercentage = Math.round((currentProgress / threshold) * 100);
        let message;
        let progressStatus;

        // Determine the progress status message
        if (currentProgress >= threshold) {
          this.logDebug('Player is whitelisted. Calculating rank.');
          // Fetch all players who are also whitelisted to determine rank.
          const allWhitelistedPlayers = await this.WhitelistProgressModel.findAll({
            where: { progress: { [Op.gte]: threshold } }
          });

          // Sort players by progress in descending order to get the correct rank.
          allWhitelistedPlayers.sort((a, b) => b.progress - a.progress);

          // Find the current player's rank.
          const playerRank = allWhitelistedPlayers.findIndex((p) => p.steamID === steamID) + 1;
          const totalWhitelisted = allWhitelistedPlayers.length;

          message = `You are on the whitelist!`;
          progressStatus = `Progress: ${progressPercentage}%\nRank: ${playerRank} of ${totalWhitelisted}`;
          this.logDebug(
            `Player ${info.player.name} is rank ${playerRank} out of ${totalWhitelisted}.`
          );
        } else {
          this.logDebug(
            'Player is not yet whitelisted. Displaying progress and "no whitelist" message.'
          );
          message = `No whitelist yet. Keep leading squads to earn more progress!`;
          progressStatus = `Progress: ${progressPercentage}%`;
        }

        this.server.rcon.warn(
          info.player.steamID,
          `${header}\n` + `${message}\n` + `${progressStatus}\n` + `${footer}`
        );
        this.logDebug('RCON message sent successfully.');
      } else {
        this.logDebug(
          `No whitelist progress found for SteamID: ${steamID}. Sending informational RCON message.`
        );
        this.server.rcon.warn(
          info.player.steamID,
          `${header}\n` +
            `No whitelist progress found for your account.\n` +
            `Start leading a squad to earn progress!\n` +
            `${footer}`
        );
        this.logDebug('Informational RCON message sent successfully.');
      }
    } catch (error) {
      this.logDebug(`[ERROR] Failed to handle chat command for SteamID: ${steamID}`, error);
      this.logDebug('Error handling chat command.');
    }
  }

  /**
   * Checks all players for eligibility and awards progress.
   */
  async onPlayerInformationUpdate(players) {
    this.logDebug('Player information update received. Checking for eligible leaders.');

    if (!Array.isArray(players) || players.length === 0) {
      this.logDebug('No players found or squads is not an array. Skipping update.');
      return;
    }
    this.logDebug(`Total players received in update: ${players.length}`);

    try {
      const now = new Date();
      const eligibleLeaders = [];

      this.logDebug('Iterating through all players to find eligible leaders.');
      for (const player of players) {
        this.logDebug(`Checking player: ${player.name} (SteamID: ${player.steamID})`);
        // Ensure player object and squad exist
        if (player && player.squad && player.isLeader) {
          this.logDebug(
            `Player ${player.name} is a squad leader in squad ${player.squad.squadName}.`
          );
          // Check if squad meets min member requirement
          const squadMembers = players.filter(
            (p) => p.squad && p.squad.squadID === player.squad.squadID
          );
          this.logDebug(
            `Squad members count: ${squadMembers.length}. Minimum required: ${this.options.minSquadMembers}.`
          );
          if (squadMembers.length >= this.options.minSquadMembers) {
            // Corrected logic: Check if squad is unlocked by converting the string to lowercase and comparing.
            const lockedString = String(player.squad.locked).toLowerCase();
            const isUnlocked = !this.options.onlyOpenSquads || lockedString === 'false';
            this.logDebug(
              `onlyOpenSquads option is ${this.options.onlyOpenSquads}. player.squad.locked is ${
                player.squad.locked
              } (type: ${typeof player.squad.locked}).`
            );
            this.logDebug(
              `The logical check (!${this.options.onlyOpenSquads} || ${lockedString} === 'false') evaluates to ${isUnlocked}.`
            );
            if (isUnlocked) {
              this.logDebug(`Player ${player.name} is an eligible leader.`);
              eligibleLeaders.push(player);
            } else {
              this.logDebug(
                `Player ${player.name} is a leader but their squad is locked. Not eligible for progress.`
              );
            }
          } else {
            this.logDebug(
              `Player ${player.name} is a leader but their squad does not meet the minimum member requirement.`
            );
          }
        } else {
          this.logDebug(
            `Player ${player.name} is not a squad leader or does not belong to a squad. Skipping.`
          );
        }
      }

      this.logDebug(`Found a total of ${eligibleLeaders.length} eligible squad leaders.`);

      // Award progress to eligible leaders.
      const progressIncrement = this.options.progressPerHour / (3600 / 30); // Award progress every 30 seconds
      this.logDebug(`Progress increment per 30 seconds: ${progressIncrement.toFixed(2)}`);

      this.logDebug('Iterating through eligible leaders to award progress.');
      for (const leader of eligibleLeaders) {
        this.logDebug(`Processing eligible leader: ${leader.name} (SteamID: ${leader.steamID})`);
        let playerRecord = await this.WhitelistProgressModel.findOne({
          where: { steamID: leader.steamID }
        });

        const oldProgress = playerRecord ? playerRecord.progress : 0;

        if (!playerRecord) {
          this.logDebug(`No existing record found for ${leader.name}. Creating a new record.`);
          playerRecord = await this.WhitelistProgressModel.create({
            steamID: leader.steamID,
            progress: 0,
            lastProgressed: now
          });
          this.logDebug(`New record created with initial progress: ${playerRecord.progress}`);
        } else {
          this.logDebug(`Existing record found. Current progress: ${playerRecord.progress}`);
        }

        const newProgress = playerRecord.progress + progressIncrement;

        // Check for milestones to send a progress message.
        const oldMilestone = Math.floor(oldProgress / 10);
        const newMilestone = Math.floor(newProgress / 10);
        const isWhitelisted = newProgress >= this.options.threshold;
        const wasWhitelisted = oldProgress >= this.options.threshold;

        const header = '═════ SL WHITELIST ═════';
        const footer = '══════════════════════';

        // Send a message only if the player is not already whitelisted and they have crossed a new 10% milestone.
        if (!wasWhitelisted && newMilestone > oldMilestone) {
          let message = '';
          if (isWhitelisted) {
            message = `You are now on the whitelist!`;
          } else {
            const progressPercentage = Math.round((newProgress / this.options.threshold) * 100);
            message = `Progress Update: ${progressPercentage}%`;
          }
          this.server.rcon.warn(leader.steamID, `${header}\n` + `${message}\n` + `${footer}`);
          this.logDebug(
            `Sent progress update message to ${leader.name}. New progress: ${newProgress.toFixed(
              2
            )}`
          );
        }

        playerRecord.progress = newProgress;
        playerRecord.lastProgressed = now; // Updated to lastProgressed
        this.logDebug(
          `New progress value for ${leader.name} before saving: ${playerRecord.progress.toFixed(2)}`
        );
        await playerRecord.save();
        this.logDebug(
          `Awarded progress to: ${
            leader.name
          }. New progress after saving: ${playerRecord.progress.toFixed(2)}`
        );
      }
      this.logDebug('Finished awarding progress to all eligible leaders.');
    } catch (error) {
      this.logDebug('[ERROR] Error in onPlayerInformationUpdate:', error);
    }
  }

  /**
   * Starts an interval to periodically award progress to eligible squad leaders.
   */
  startProgressTracking() {
    this.logDebug('Attempting to start progress tracking interval.');
    if (this.progressInterval) {
      this.logDebug('Existing progress interval found. Clearing it before starting a new one.');
      clearInterval(this.progressInterval);
    }
    // This interval runs every 30 seconds. The progress amount is adjusted accordingly.
    this.progressInterval = setInterval(async () => {
      this.logDebug('Progress tracking interval triggered.');
      const players = this.server.players;
      if (players) {
        this.logDebug('Player data available. Calling onPlayerInformationUpdate.');
        await this.onPlayerInformationUpdate(players);
      } else {
        this.logDebug('No player data available. Skipping progress update.');
      }
    }, 30000); // 30 seconds
    this.logDebug('Progress tracking interval started successfully.');
  }

  /**
   * Starts an interval to periodically decay progress for all players.
   */
  startDecayInterval() {
    this.logDebug('Attempting to start decay interval.');
    if (this.decayInterval) {
      this.logDebug('Existing decay interval found. Clearing it before starting a new one.');
      clearInterval(this.decayInterval);
    }
    this.logDebug(`Decay interval set to run every ${this.options.decayIntervalSeconds} seconds.`);
    this.decayInterval = setInterval(async () => {
      this.logDebug('Decay interval triggered. Calling decayWhitelistProgress.');
      await this.decayWhitelistProgress();
    }, this.options.decayIntervalSeconds * 1000);
    this.logDebug('Decay interval started successfully.');
  }

  /**
   * Starts an interval to periodically generate the whitelist file.
   * This replaces the previous NEW_GAME event trigger.
   */
  startWhitelistGenerationInterval() {
    this.logDebug('Attempting to start whitelist generation interval.');
    if (this.whitelistInterval) {
      this.logDebug(
        'Existing whitelist generation interval found. Clearing it before starting a new one.'
      );
      clearInterval(this.whitelistInterval);
    }
    const intervalInMinutes = this.options.whitelistUpdateMinutes;
    const intervalMilliseconds = intervalInMinutes * 60 * 1000;
    this.logDebug(`Whitelist generation interval set to run every ${intervalInMinutes} minutes.`);

    this.whitelistInterval = setInterval(async () => {
      this.logDebug('Whitelist generation interval triggered. Calling generateWhitelistFile.');
      await this.generateWhitelistFile();
    }, intervalMilliseconds);

    this.logDebug('Whitelist generation interval started successfully.');
  }

  /**
   * Decays the whitelist progress for all players based on new rules.
   */
  async decayWhitelistProgress() {
    this.logDebug('Starting progress decay process.');
    const players = this.server.players;
    const playerCount = players ? players.length : 0;
    this.logDebug(
      `Current player count: ${playerCount}. Minimum players for decay: ${this.options.minPlayersForDecay}.`
    );

    // Check if the server population is too low for decay.
    if (playerCount < this.options.minPlayersForDecay) {
      this.logDebug('Player count is below the minimum threshold. Halting decay process.');
      return;
    }

    const now = new Date();
    const decayAfterMilliseconds = this.options.decayAfterHours * 60 * 60 * 1000;
    const decayIntervalMilliseconds = this.options.decayIntervalSeconds * 1000;
    const decayAmountPerInterval =
      (this.options.decayPerHour / (60 * 60 * 1000)) * decayIntervalMilliseconds;

    this.logDebug(
      `Decay is active. Decay amount per interval: ${decayAmountPerInterval.toFixed(2)}`
    );

    try {
      this.logDebug('Fetching all players from the database for decay calculation.');
      const allPlayers = await this.WhitelistProgressModel.findAll();

      let updatedCount = 0;
      for (const playerRecord of allPlayers) {
        const timeSinceLastProgress = now - playerRecord.lastProgressed;
        this.logDebug(
          `Player ${playerRecord.steamID}: time since last progress: ${timeSinceLastProgress}ms. Threshold: ${decayAfterMilliseconds}ms.`
        );

        // Only apply decay if the player has not gained progress for the configured duration.
        if (timeSinceLastProgress > decayAfterMilliseconds) {
          this.logDebug(`Player ${playerRecord.steamID} is inactive. Applying decay.`);
          // Calculate the new progress. Ensure it doesn't go below 0.
          const newProgress = Math.max(0, playerRecord.progress - decayAmountPerInterval);

          if (newProgress < playerRecord.progress) {
            playerRecord.progress = newProgress;
            await playerRecord.save();
            updatedCount++;
            this.logDebug(
              `Decayed progress for ${
                playerRecord.steamID
              }. New progress: ${playerRecord.progress.toFixed(2)}`
            );
          }
        } else {
          this.logDebug(`Player ${playerRecord.steamID} is active. Skipping decay.`);
        }
      }
      this.logDebug(`Progress decay complete. Updated ${updatedCount} players.`);
    } catch (error) {
      this.logDebug('[ERROR] Failed to decay whitelist progress:', error);
      this.logDebug('Error during progress decay process.');
    }
  }

  /**
   * Ensures the whitelist file exists, creating it if it doesn't.
   */
  async ensureWhitelistFileExists() {
    this.logDebug('Starting process to ensure whitelist file exists.');
    try {
      const userPath = this.options.managedWhitelistPath;
      this.logDebug(`User-defined path: ${userPath}`);
      // Get the server's base path, with a fallback just in case.
      const basePath =
        this.server &&
        this.server.squadJS &&
        this.server.squadJS.options &&
        this.server.squadJS.options.path
          ? this.server.squadJS.options.path
          : '';
      this.logDebug(`Base server path: ${basePath}`);

      const filePath = path.isAbsolute(userPath) ? userPath : path.join(basePath, userPath);
      this.logDebug(`Determined full file path: ${filePath}`);

      this.logDebug('Creating directory recursively if it does not exist...');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      this.logDebug('Directory created or already exists.');

      this.logDebug('Writing to file with "a+" flag to ensure file existence...');
      await fs.writeFile(filePath, '', { flag: 'a+' });
      this.logDebug('Whitelist file path confirmed to exist.');
    } catch (error) {
      this.logDebug('[ERROR] Failed to ensure whitelist file exists:', error);
      this.logDebug('Error during file existence check.');
    }
  }

  /**
   * Generates and writes the admin_whitelist.txt file based on current progress.
   */
  async generateWhitelistFile() {
    this.logDebug('Starting generation of admin_whitelist.txt file.');
    try {
      // Get the user-defined path and group name from options.
      const userPath = this.options.managedWhitelistPath;
      const groupName = this.options.managedWhitelistGroup;
      this.logDebug(`Configured whitelist path: ${userPath}`);
      this.logDebug(`Configured group name: ${groupName}`);

      // Get the server's base path, with a fallback just in case.
      const basePath =
        this.server &&
        this.server.squadJS &&
        this.server.squadJS.options &&
        this.server.squadJS.options.path
          ? this.server.squadJS.options.path
          : '';
      this.logDebug(`Base server path: ${basePath}`);

      // Determine the full file path.
      const filePath = path.isAbsolute(userPath) ? userPath : path.join(basePath, userPath);
      this.logDebug(`Determined full file path: ${filePath}`);

      this.logDebug(
        `Fetching whitelisted players from database with a progress >= ${this.options.threshold}...`
      );
      // Fetch all whitelisted players from the database.
      const whitelistedPlayers = await this.WhitelistProgressModel.findAll({
        where: { progress: { [Op.gte]: this.options.threshold } },
        attributes: ['steamID']
      });
      this.logDebug(`Found ${whitelistedPlayers.length} players to be whitelisted.`);

      // Construct the content for the file.
      const groupDefinition = `Group=${groupName}:reserve`;
      const adminLines = whitelistedPlayers
        .map((p) => `Admin=${p.steamID}:${groupName}`)
        .join('\n');
      const whitelistContent = `${groupDefinition}\n\n${adminLines}\n`;
      this.logDebug('Whitelist content constructed.');

      this.logDebug('Writing whitelist content to file...');
      await fs.writeFile(filePath, whitelistContent);

      this.logDebug(
        `Wrote ${whitelistedPlayers.length} players to the whitelist file located at: ${filePath}`
      );
      this.logDebug('Whitelist file generation complete.');
    } catch (error) {
      this.logDebug('[ERROR] Failed to generate whitelist file:', error);
      this.logDebug('Error during whitelist file generation process.');
    }
  }
}
