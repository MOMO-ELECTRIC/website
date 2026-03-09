#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_RUNTIME_PATH = path.resolve(process.cwd(), 'secret', 'evhome_runtime.json');
const DEFAULT_OP_ITEM = 'apply.evhome.sce.com (apply@momoelec.com)';

function env(name, fallback = undefined) {
  return process.env[name] ?? fallback;
}

function getOnePasswordField(item, field) {
  return execFileSync('op', ['item', 'get', item, `--fields=${field}`, '--reveal'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function getRuntimePath() {
  return path.resolve(env('EVHOME_RUNTIME_CREDENTIALS_FILE', DEFAULT_RUNTIME_PATH));
}

function readRuntimeCredentials(filePath = getRuntimePath()) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const username = String(parsed.username || parsed.email || '').trim();
  const password = String(parsed.password || '').trim();

  if (!username || !password) {
    throw new Error(`EVHOME runtime credentials file is missing username/email or password: ${filePath}`);
  }

  return {
    username,
    password,
    filePath
  };
}

function localCredentialSource() {
  const username = env('EVHOME_USERNAME');
  const password = env('EVHOME_PASSWORD');
  if (username && password) {
    return {
      source: 'env',
      username,
      password,
      item: null,
      runtimeFile: null
    };
  }

  const runtime = readRuntimeCredentials();
  if (runtime) {
    return {
      source: 'runtime-file',
      username: runtime.username,
      password: runtime.password,
      item: null,
      runtimeFile: runtime.filePath
    };
  }

  return null;
}

function getCredentials() {
  const local = localCredentialSource();
  if (local) {
    return local;
  }

  const item = env('EVHOME_OP_ITEM', DEFAULT_OP_ITEM);
  const usernameField = env('EVHOME_OP_USERNAME_FIELD', 'username');
  const passwordField = env('EVHOME_OP_PASSWORD_FIELD', 'password');
  const username = getOnePasswordField(item, usernameField);
  const password = getOnePasswordField(item, passwordField);
  return {
    source: '1password',
    item,
    username,
    password,
    runtimeFile: getRuntimePath()
  };
}

function describeCredentialSetup() {
  const local = localCredentialSource();
  if (local) {
    return {
      preferredSource: local.source,
      runtimeFile: local.runtimeFile || getRuntimePath(),
      opItem: env('EVHOME_OP_ITEM', DEFAULT_OP_ITEM)
    };
  }

  return {
    preferredSource: '1password',
    runtimeFile: getRuntimePath(),
    opItem: env('EVHOME_OP_ITEM', DEFAULT_OP_ITEM)
  };
}

export {
  DEFAULT_OP_ITEM,
  DEFAULT_RUNTIME_PATH,
  describeCredentialSetup,
  env,
  getCredentials,
  getRuntimePath,
  readRuntimeCredentials
};
