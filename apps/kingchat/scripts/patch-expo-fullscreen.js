#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = require.resolve('expo-notifications/package.json');
const expoNotificationsVersion = require(packageJsonPath).version;

// This project intentionally uses the Expo SDK 54 line. Fail closed if the
// upstream Android builder has changed, rather than silently shipping a call
// notification without a full-screen PendingIntent.
if (!/^0\.32\./.test(expoNotificationsVersion)) {
  throw new Error(
    'Unsupported expo-notifications version ' + expoNotificationsVersion +
    '. Review the Android full-screen notification patch before upgrading.'
  );
}

const packageRoot = path.dirname(packageJsonPath);
const builderPath = path.join(
  packageRoot,
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'notifications',
  'notifications',
  'presentation',
  'builders',
  'ExpoNotificationBuilder.kt'
);

if (!fs.existsSync(builderPath)) {
  throw new Error('Expo Notifications Android builder was not found: ' + builderPath);
}

let source = fs.readFileSync(builderPath, 'utf8');
const oldBlock = [
  '    builder.setContentIntent(',
  '      createNotificationResponseIntent(',
  '        context,',
  '        notification,',
  '        defaultAction',
  '      )',
  '    )'
].join('\n');

const newBlock = [
  '    val contentIntent = createNotificationResponseIntent(',
  '      context,',
  '      notification,',
  '      defaultAction',
  '    )',
  '    builder.setContentIntent(contentIntent)',
  '    // Guftin marks only incoming-call notifications with this private data flag.',
  '    // Use Android CATEGORY_CALL and a full-screen PendingIntent so the OS can',
  '    // present the app call screen over the lock screen when user access allows it.',
  '    if (content.body?.optBoolean("__guftin_full_screen_intent", false) == true) {',
  '      builder.setCategory(NotificationCompat.CATEGORY_CALL)',
  '      builder.setFullScreenIntent(contentIntent, true)',
  '    }'
].join('\n');

if (source.includes('content.body?.optBoolean("__guftin_full_screen_intent", false)')) {
  if (!source.includes('builder.setFullScreenIntent(contentIntent, true)') ||
      !source.includes('builder.setCategory(NotificationCompat.CATEGORY_CALL)')) {
    throw new Error('Expo Notifications full-screen patch is only partially applied.');
  }
  console.log('expo-notifications ' + expoNotificationsVersion + ': full-screen incoming-call support already present.');
  process.exit(0);
}

const matches = source.split(oldBlock).length - 1;
if (matches !== 1) {
  throw new Error(
    'Expected exactly one Expo notification content PendingIntent block, found ' + matches +
    '. Review the upstream Expo SDK source before patching.'
  );
}

source = source.replace(oldBlock, newBlock);
if (!source.includes('builder.setFullScreenIntent(contentIntent, true)') ||
    !source.includes('builder.setCategory(NotificationCompat.CATEGORY_CALL)')) {
  throw new Error('Expo Notifications full-screen patch verification failed.');
}

fs.writeFileSync(builderPath, source);
console.log('expo-notifications ' + expoNotificationsVersion + ': enabled CATEGORY_CALL + full-screen PendingIntent for marked Guftin call notifications.');
