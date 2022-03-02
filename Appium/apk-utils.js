"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.REMOTE_CACHE_ROOT = void 0;

require("source-map-support/register");

var _helpers = require("../helpers.js");

var _teen_process = require("teen_process");

var _logger = _interopRequireDefault(require("../logger.js"));

var _path = _interopRequireDefault(require("path"));

var _lodash = _interopRequireDefault(require("lodash"));

var _asyncbox = require("asyncbox");

var _appiumSupport = require("appium-support");

var _semver = _interopRequireDefault(require("semver"));

var _os = _interopRequireDefault(require("os"));

var _lruCache = _interopRequireDefault(require("lru-cache"));

var _adbkitApkreader = _interopRequireDefault(require("adbkit-apkreader"));

let apkUtilsMethods = {};
const ACTIVITIES_TROUBLESHOOTING_LINK = 'https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/android/activity-startup.md';
apkUtilsMethods.APP_INSTALL_STATE = {
  UNKNOWN: 'unknown',
  NOT_INSTALLED: 'notInstalled',
  NEWER_VERSION_INSTALLED: 'newerVersionInstalled',
  SAME_VERSION_INSTALLED: 'sameVersionInstalled',
  OLDER_VERSION_INSTALLED: 'olderVersionInstalled'
};
const REMOTE_CACHE_ROOT = '/data/local/tmp/appium_cache';
exports.REMOTE_CACHE_ROOT = REMOTE_CACHE_ROOT;

apkUtilsMethods.isAppInstalled = async function isAppInstalled(pkg) {
  _logger.default.debug(`Getting install status for ${pkg}`);

  const installedPattern = new RegExp(`^\\s*Package\\s+\\[${_lodash.default.escapeRegExp(pkg)}\\][^:]+:$`, 'm');

  try {
    const stdout = await this.shell(['dumpsys', 'package', pkg]);
    const isInstalled = installedPattern.test(stdout);

    _logger.default.debug(`'${pkg}' is${!isInstalled ? ' not' : ''} installed`);

    return isInstalled;
  } catch (e) {
    throw new Error(`Error finding if '${pkg}' is installed. Original error: ${e.message}`);
  }
};

apkUtilsMethods.startUri = async function startUri(uri, pkg, opts = {}) {
  const {
    waitForLaunch = true
  } = opts;

  if (!uri || !pkg) {
    throw new Error('URI and package arguments are required');
  }

  const args = ['am', 'start'];

  if (waitForLaunch) {
    args.push('-W');
  }

  args.push('-a', 'android.intent.action.VIEW', '-d', (0, _helpers.escapeShellArg)(uri), pkg);

  try {
    const res = await this.shell(args);

    if (res.toLowerCase().includes('unable to resolve intent')) {
      throw new Error(res);
    }
  } catch (e) {
    throw new Error(`Error attempting to start URI. Original error: ${e}`);
  }
};

apkUtilsMethods.startApp = async function startApp(startAppOptions = {}) {
  if (!startAppOptions.pkg || !(startAppOptions.activity || startAppOptions.action)) {
    throw new Error('pkg, and activity or intent action, are required to start an application');
  }

  startAppOptions = _lodash.default.clone(startAppOptions);

  if (startAppOptions.activity) {
    startAppOptions.activity = startAppOptions.activity.replace('$', '\\$');
  }

  _lodash.default.defaults(startAppOptions, {
    waitPkg: startAppOptions.pkg,
    waitForLaunch: true,
    waitActivity: false,
    retry: true,
    stopApp: true
  });

  startAppOptions.waitPkg = startAppOptions.waitPkg || startAppOptions.pkg;
  const apiLevel = await this.getApiLevel();
  const cmd = (0, _helpers.buildStartCmd)(startAppOptions, apiLevel);
  const intentName = `${startAppOptions.action}${startAppOptions.optionalIntentArguments ? ' ' + startAppOptions.optionalIntentArguments : ''}`;

  try {
    const shellOpts = {};

    if (_lodash.default.isInteger(startAppOptions.waitDuration) && startAppOptions.waitDuration >= 0) {
      shellOpts.timeout = startAppOptions.waitDuration;
    }

    const stdout = await this.shell(cmd, shellOpts);

    if (stdout.includes('Error: Activity class') && stdout.includes('does not exist')) {
      if (startAppOptions.retry && !startAppOptions.activity.startsWith('.')) {
        _logger.default.debug(`We tried to start an activity that doesn't exist, ` + `retrying with '.${startAppOptions.activity}' activity name`);

        startAppOptions.activity = `.${startAppOptions.activity}`;
        startAppOptions.retry = false;
        return await this.startApp(startAppOptions);
      }

      throw new Error(`Activity name '${startAppOptions.activity}' used to start the app doesn't ` + `exist or cannot be launched! Make sure it exists and is a launchable activity`);
    } else if (stdout.includes('Error: Intent does not match any activities') || stdout.includes('Error: Activity not started, unable to resolve Intent')) {
      throw new Error(`Activity for intent '${intentName}' used to start the app doesn't ` + `exist or cannot be launched! Make sure it exists and is a launchable activity`);
    } else if (stdout.includes('java.lang.SecurityException')) {
      throw new Error(`The permission to start '${startAppOptions.activity}' activity has been denied.` + `Make sure the activity/package names are correct.`);
    }

    if (startAppOptions.waitActivity) {
      await this.waitForActivity(startAppOptions.waitPkg, startAppOptions.waitActivity, startAppOptions.waitDuration);
    }

    return stdout;
  } catch (e) {
    const appDescriptor = startAppOptions.pkg || intentName;
    throw new Error(`Cannot start the '${appDescriptor}' application. ` + `Visit ${ACTIVITIES_TROUBLESHOOTING_LINK} for troubleshooting. ` + `Original error: ${e.message}`);
  }
};

apkUtilsMethods.dumpWindows = async function dumpWindows() {
  const apiLevel = await this.getApiLevel();
  const dumpsysArg = apiLevel >= 29 ? 'displays' : 'windows';
  const cmd = ['dumpsys', 'window', dumpsysArg];
  return await this.shell(cmd);
};

apkUtilsMethods.getFocusedPackageAndActivity = async function getFocusedPackageAndActivity() {
  _logger.default.debug('Getting focused package and activity');

  const nullFocusedAppRe = new RegExp(/^\s*mFocusedApp=null/, 'm');
  const focusedAppRe = new RegExp('^\\s*mFocusedApp.+Record\\{.*\\s([^\\s\\/\\}]+)' + '\\/([^\\s\\/\\}\\,]+)\\,?(\\s[^\\s\\/\\}]+)*\\}', 'm');
  const nullCurrentFocusRe = new RegExp(/^\s*mCurrentFocus=null/, 'm');
  const currentFocusAppRe = new RegExp('^\\s*mCurrentFocus.+\\{.+\\s([^\\s\\/]+)\\/([^\\s]+)\\b', 'm');

  try {
    const stdout = await this.dumpWindows();

    for (const pattern of [currentFocusAppRe, focusedAppRe]) {
      const match = pattern.exec(stdout);

      if (match) {
        return {
          appPackage: match[1].trim(),
          appActivity: match[2].trim()
        };
      }
    }

    for (const pattern of [nullFocusedAppRe, nullCurrentFocusRe]) {
      if (pattern.exec(stdout)) {
        return {
          appPackage: null,
          appActivity: null
        };
      }
    }

    throw new Error('Could not parse activity from dumpsys');
  } catch (e) {
    throw new Error(`Could not get focusPackageAndActivity. Original error: ${e.message}`);
  }
};

apkUtilsMethods.waitForActivityOrNot = async function waitForActivityOrNot(pkg, activity, waitForStop, waitMs = 20000) {
  if (!pkg || !activity) {
    throw new Error('Package and activity required.');
  }

  _logger.default.debug(`Waiting up to ${waitMs}ms for activity matching pkg: '${pkg}' and ` + `activity: '${activity}' to${waitForStop ? ' not' : ''} be focused`);

  const splitNames = names => names.split(',').map(name => name.trim());

  const allPackages = splitNames(pkg);
  const allActivities = splitNames(activity);
  const possibleActivityNames = [];

  for (const oneActivity of allActivities) {
    if (oneActivity.startsWith('.')) {
      for (const currentPkg of allPackages) {
        possibleActivityNames.push(`${currentPkg}${oneActivity}`.replace(/\.+/g, '.'));
      }
    } else {
      possibleActivityNames.push(oneActivity);
      possibleActivityNames.push(`${pkg}.${oneActivity}`);
    }
  }

  _logger.default.debug(`Possible activities, to be checked: ${possibleActivityNames.map(name => `'${name}'`).join(', ')}`);

  const possibleActivityPatterns = possibleActivityNames.map(actName => new RegExp(`^${actName.replace(/\./g, '\\.').replace(/\*/g, '.*?').replace(/\$/g, '\\$')}$`));

  const conditionFunc = async () => {
    let appPackage;
    let appActivity;

    try {
      ({
        appPackage,
        appActivity
      } = await this.getFocusedPackageAndActivity());
    } catch (e) {
      _logger.default.debug(e.message);

      return false;
    }

    if (appActivity && appPackage) {
      const fullyQualifiedActivity = appActivity.startsWith('.') ? `${appPackage}${appActivity}` : appActivity;

      _logger.default.debug(`Found package: '${appPackage}' and fully qualified activity name : '${fullyQualifiedActivity}'`);

      const isActivityFound = _lodash.default.includes(allPackages, appPackage) && possibleActivityPatterns.some(p => p.test(fullyQualifiedActivity));

      if (!waitForStop && isActivityFound || waitForStop && !isActivityFound) {
        return true;
      }
    }

    _logger.default.debug('Incorrect package and activity. Retrying.');

    return false;
  };

  try {
    await (0, _asyncbox.waitForCondition)(conditionFunc, {
      waitMs: parseInt(waitMs, 10),
      intervalMs: 500
    });
  } catch (e) {
    throw new Error(`${possibleActivityNames.map(name => `'${name}'`).join(' or ')} never ${waitForStop ? 'stopped' : 'started'}. ` + `Visit ${ACTIVITIES_TROUBLESHOOTING_LINK} for troubleshooting`);
  }
};

apkUtilsMethods.waitForActivity = async function waitForActivity(pkg, act, waitMs = 20000) {
  await this.waitForActivityOrNot(pkg, act, false, waitMs);
};

apkUtilsMethods.waitForNotActivity = async function waitForNotActivity(pkg, act, waitMs = 20000) {
  await this.waitForActivityOrNot(pkg, act, true, waitMs);
};

apkUtilsMethods.uninstallApk = async function uninstallApk(pkg, options = {}) {
  _logger.default.debug(`Uninstalling ${pkg}`);

  if (!(await this.isAppInstalled(pkg))) {
    _logger.default.info(`${pkg} was not uninstalled, because it was not present on the device`);

    return false;
  }

  const cmd = ['uninstall'];

  if (options.keepData) {
    cmd.push('-k');
  }

  cmd.push(pkg);
  let stdout;

  try {
    await this.forceStop(pkg);
    stdout = (await this.adbExec(cmd, {
      timeout: options.timeout
    })).trim();
  } catch (e) {
    throw new Error(`Unable to uninstall APK. Original error: ${e.message}`);
  }

  _logger.default.debug(`'adb ${cmd.join(' ')}' command output: ${stdout}`);

  if (stdout.includes('Success')) {
    _logger.default.info(`${pkg} was successfully uninstalled`);

    return true;
  }

  _logger.default.info(`${pkg} was not uninstalled`);

  return false;
};

apkUtilsMethods.installFromDevicePath = async function installFromDevicePath(apkPathOnDevice, opts = {}) {
  let stdout = await this.shell(['pm', 'install', '-r', apkPathOnDevice], opts);

  if (stdout.indexOf('Failure') !== -1) {
    throw new Error(`Remote install failed: ${stdout}`);
  }
};

apkUtilsMethods.cacheApk = async function cacheApk(apkPath, options = {}) {
  const appHash = await _appiumSupport.fs.hash(apkPath);

  const remotePath = _path.default.posix.join(REMOTE_CACHE_ROOT, `${appHash}.apk`);

  const remoteCachedFiles = [];

  try {
    const errorMarker = '_ERROR_';
    let lsOutput = null;

    if (this._areExtendedLsOptionsSupported === true || !_lodash.default.isBoolean(this._areExtendedLsOptionsSupported)) {
      lsOutput = await this.shell([`ls -t -1 ${REMOTE_CACHE_ROOT} 2>&1 || echo ${errorMarker}`]);
    }

    if (!_lodash.default.isString(lsOutput) || lsOutput.includes(errorMarker) && !lsOutput.includes(REMOTE_CACHE_ROOT)) {
      if (!_lodash.default.isBoolean(this._areExtendedLsOptionsSupported)) {
        _logger.default.debug('The current Android API does not support extended ls options. ' + 'Defaulting to no-options call');
      }

      lsOutput = await this.shell([`ls ${REMOTE_CACHE_ROOT} 2>&1 || echo ${errorMarker}`]);
      this._areExtendedLsOptionsSupported = false;
    } else {
      this._areExtendedLsOptionsSupported = true;
    }

    if (lsOutput.includes(errorMarker)) {
      throw new Error(lsOutput.substring(0, lsOutput.indexOf(errorMarker)));
    }

    remoteCachedFiles.push(...lsOutput.split('\n').map(x => x.trim()).filter(Boolean));
  } catch (e) {
    _logger.default.debug(`Got an error '${e.message.trim()}' while getting the list of files in the cache. ` + `Assuming the cache does not exist yet`);

    await this.shell(['mkdir', '-p', REMOTE_CACHE_ROOT]);
  }

  _logger.default.debug(`The count of applications in the cache: ${remoteCachedFiles.length}`);

  const toHash = remotePath => _path.default.posix.parse(remotePath).name;

  if (remoteCachedFiles.some(x => toHash(x) === appHash)) {
    _logger.default.info(`The application at '${apkPath}' is already cached to '${remotePath}'`);

    this.shell(['touch', '-am', remotePath]).catch(() => {});
  } else {
    _logger.default.info(`Caching the application at '${apkPath}' to '${remotePath}'`);

    const timer = new _appiumSupport.timing.Timer().start();
    await this.push(apkPath, remotePath, {
      timeout: options.timeout
    });
    const {
      size
    } = await _appiumSupport.fs.stat(apkPath);

    _logger.default.info(`The upload of '${_path.default.basename(apkPath)}' (${_appiumSupport.util.toReadableSizeString(size)}) ` + `took ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
  }

  if (!this.remoteAppsCache) {
    this.remoteAppsCache = new _lruCache.default({
      max: this.remoteAppsCacheLimit
    });
  }

  _lodash.default.difference(this.remoteAppsCache.keys(), remoteCachedFiles.map(toHash)).forEach(hash => this.remoteAppsCache.del(hash));

  this.remoteAppsCache.set(appHash, remotePath);
  const entriesToCleanup = remoteCachedFiles.map(x => _path.default.posix.join(REMOTE_CACHE_ROOT, x)).filter(x => !this.remoteAppsCache.has(toHash(x))).slice(this.remoteAppsCacheLimit - this.remoteAppsCache.keys().length);

  if (!_lodash.default.isEmpty(entriesToCleanup)) {
    try {
      await this.shell(['rm', '-f', ...entriesToCleanup]);

      _logger.default.debug(`Deleted ${entriesToCleanup.length} expired application cache entries`);
    } catch (e) {
      _logger.default.warn(`Cannot delete ${entriesToCleanup.length} expired application cache entries. ` + `Original error: ${e.message}`);
    }
  }

  return remotePath;
};

apkUtilsMethods.install = async function install(appPath, options = {}) {
  if (appPath.endsWith(_helpers.APKS_EXTENSION)) {
    return await this.installApks(appPath, options);
  }

  options = _lodash.default.cloneDeep(options);

  _lodash.default.defaults(options, {
    replace: true,
    timeout: this.adbExecTimeout === _helpers.DEFAULT_ADB_EXEC_TIMEOUT ? _helpers.APK_INSTALL_TIMEOUT : this.adbExecTimeout,
    timeoutCapName: 'androidInstallTimeout'
  });

  const installArgs = (0, _helpers.buildInstallArgs)(await this.getApiLevel(), options);

  if (options.noIncremental && (await this.isIncrementalInstallSupported())) {
    installArgs.push('--no-incremental');
  }

  const installOpts = {
    timeout: options.timeout,
    timeoutCapName: options.timeoutCapName
  };
  const installCmd = ['install', ...installArgs, appPath];

  let performAppInstall = async () => await this.adbExec(installCmd, installOpts);

  let shouldCacheApp = this.remoteAppsCacheLimit > 0;

  if (shouldCacheApp) {
    shouldCacheApp = !(await this.isStreamedInstallSupported());

    if (!shouldCacheApp) {
      _logger.default.info(`The application at '${appPath}' will not be cached, because the device under test has ` + `confirmed the support of streamed installs`);
    }
  }

  if (shouldCacheApp) {
    const clearCache = async () => {
      _logger.default.info(`Clearing the cache at '${REMOTE_CACHE_ROOT}'`);

      await this.shell(['rm', '-rf', `${REMOTE_CACHE_ROOT}/*`]);
    };

    const cacheApp = async () => await this.cacheApk(appPath, {
      timeout: options.timeout
    });

    try {
      const cachedAppPath = await cacheApp();

      performAppInstall = async () => {
        const pmInstallCmdByRemotePath = remotePath => ['pm', 'install', ...installArgs, remotePath];

        const output = await this.shell(pmInstallCmdByRemotePath(cachedAppPath), installOpts);

        if (/\bINSTALL_FAILED_INSUFFICIENT_STORAGE\b/.test(output)) {
          _logger.default.warn(`There was a failure while installing '${appPath}' ` + `because of the insufficient device storage space`);

          await clearCache();

          _logger.default.info(`Consider decreasing the maximum amount of cached apps ` + `(currently ${this.remoteAppsCacheLimit}) to avoid such issues in the future`);

          const newCachedAppPath = await cacheApp();
          return await this.shell(pmInstallCmdByRemotePath(newCachedAppPath), installOpts);
        }

        return output;
      };
    } catch (e) {
      _logger.default.debug(e);

      _logger.default.warn(`There was a failure while caching '${appPath}': ${e.message}`);

      _logger.default.warn('Falling back to the default installation procedure');

      await clearCache();
    }
  }

  try {
    const timer = new _appiumSupport.timing.Timer().start();
    const output = await performAppInstall();

    _logger.default.info(`The installation of '${_path.default.basename(appPath)}' took ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);

    const truncatedOutput = !_lodash.default.isString(output) || output.length <= 300 ? output : `${output.substr(0, 150)}...${output.substr(output.length - 150)}`;

    _logger.default.debug(`Install command stdout: ${truncatedOutput}`);

    if (/\[INSTALL[A-Z_]+FAILED[A-Z_]+\]/.test(output)) {
      if (this.isTestPackageOnlyError(output)) {
        const msg = `Set 'allowTestPackages' capability to true in order to allow test packages installation.`;

        _logger.default.warn(msg);

        throw new Error(`${output}\n${msg}`);
      }

      throw new Error(output);
    }
  } catch (err) {
    if (!err.message.includes('INSTALL_FAILED_ALREADY_EXISTS')) {
      throw err;
    }

    _logger.default.debug(`Application '${appPath}' already installed. Continuing.`);
  }
};

apkUtilsMethods.getApplicationInstallState = async function getApplicationInstallState(appPath, pkg = null) {
  let apkInfo = null;

  if (!pkg) {
    apkInfo = await this.getApkInfo(appPath);
    pkg = apkInfo.name;
  }

  if (!pkg) {
    _logger.default.warn(`Cannot read the package name of '${appPath}'`);

    return this.APP_INSTALL_STATE.UNKNOWN;
  }

  if (!(await this.isAppInstalled(pkg))) {
    _logger.default.debug(`App '${appPath}' is not installed`);

    return this.APP_INSTALL_STATE.NOT_INSTALLED;
  }

  const {
    versionCode: pkgVersionCode,
    versionName: pkgVersionNameStr
  } = await this.getPackageInfo(pkg);

  const pkgVersionName = _semver.default.valid(_semver.default.coerce(pkgVersionNameStr));

  if (!apkInfo) {
    apkInfo = await this.getApkInfo(appPath);
  }

  const {
    versionCode: apkVersionCode,
    versionName: apkVersionNameStr
  } = apkInfo;

  const apkVersionName = _semver.default.valid(_semver.default.coerce(apkVersionNameStr));

  if (!_lodash.default.isInteger(apkVersionCode) || !_lodash.default.isInteger(pkgVersionCode)) {
    _logger.default.warn(`Cannot read version codes of '${appPath}' and/or '${pkg}'`);

    if (!_lodash.default.isString(apkVersionName) || !_lodash.default.isString(pkgVersionName)) {
      _logger.default.warn(`Cannot read version names of '${appPath}' and/or '${pkg}'`);

      return this.APP_INSTALL_STATE.UNKNOWN;
    }
  }

  if (_lodash.default.isInteger(apkVersionCode) && _lodash.default.isInteger(pkgVersionCode)) {
    if (pkgVersionCode > apkVersionCode) {
      _logger.default.debug(`The version code of the installed '${pkg}' is greater than the application version code (${pkgVersionCode} > ${apkVersionCode})`);

      return this.APP_INSTALL_STATE.NEWER_VERSION_INSTALLED;
    }

    if (pkgVersionCode === apkVersionCode) {
      if (_lodash.default.isString(apkVersionName) && _lodash.default.isString(pkgVersionName) && _semver.default.satisfies(pkgVersionName, `>=${apkVersionName}`)) {
        _logger.default.debug(`The version name of the installed '${pkg}' is greater or equal to the application version name ('${pkgVersionName}' >= '${apkVersionName}')`);

        return _semver.default.satisfies(pkgVersionName, `>${apkVersionName}`) ? this.APP_INSTALL_STATE.NEWER_VERSION_INSTALLED : this.APP_INSTALL_STATE.SAME_VERSION_INSTALLED;
      }

      if (!_lodash.default.isString(apkVersionName) || !_lodash.default.isString(pkgVersionName)) {
        _logger.default.debug(`The version name of the installed '${pkg}' is equal to application version name (${pkgVersionCode} === ${apkVersionCode})`);

        return this.APP_INSTALL_STATE.SAME_VERSION_INSTALLED;
      }
    }
  } else if (_lodash.default.isString(apkVersionName) && _lodash.default.isString(pkgVersionName) && _semver.default.satisfies(pkgVersionName, `>=${apkVersionName}`)) {
    _logger.default.debug(`The version name of the installed '${pkg}' is greater or equal to the application version name ('${pkgVersionName}' >= '${apkVersionName}')`);

    return _semver.default.satisfies(pkgVersionName, `>${apkVersionName}`) ? this.APP_INSTALL_STATE.NEWER_VERSION_INSTALLED : this.APP_INSTALL_STATE.SAME_VERSION_INSTALLED;
  }

  _logger.default.debug(`The installed '${pkg}' package is older than '${appPath}' (${pkgVersionCode} < ${apkVersionCode} or '${pkgVersionName}' < '${apkVersionName}')'`);

  return this.APP_INSTALL_STATE.OLDER_VERSION_INSTALLED;
};

apkUtilsMethods.installOrUpgrade = async function installOrUpgrade(appPath, pkg = null, options = {}) {
  if (!pkg) {
    const apkInfo = await this.getApkInfo(appPath);
    pkg = apkInfo.name;
  }

  const {
    enforceCurrentBuild
  } = options;
  const appState = await this.getApplicationInstallState(appPath, pkg);
  let wasUninstalled = false;

  const uninstallPackage = async () => {
    if (!(await this.uninstallApk(pkg))) {
      throw new Error(`'${pkg}' package cannot be uninstalled`);
    }

    wasUninstalled = true;
  };

  switch (appState) {
    case this.APP_INSTALL_STATE.NOT_INSTALLED:
      _logger.default.debug(`Installing '${appPath}'`);

      await this.install(appPath, Object.assign({}, options, {
        replace: false
      }));
      return {
        appState,
        wasUninstalled
      };

    case this.APP_INSTALL_STATE.NEWER_VERSION_INSTALLED:
      if (enforceCurrentBuild) {
        _logger.default.info(`Downgrading '${pkg}' as requested`);

        await uninstallPackage();
        break;
      }

      _logger.default.debug(`There is no need to downgrade '${pkg}'`);

      return {
        appState,
        wasUninstalled
      };

    case this.APP_INSTALL_STATE.SAME_VERSION_INSTALLED:
      if (enforceCurrentBuild) {
        break;
      }

      _logger.default.debug(`There is no need to install/upgrade '${appPath}'`);

      return {
        appState,
        wasUninstalled
      };

    case this.APP_INSTALL_STATE.OLDER_VERSION_INSTALLED:
      _logger.default.debug(`Executing upgrade of '${appPath}'`);

      break;

    default:
      _logger.default.debug(`The current install state of '${appPath}' is unknown. Installing anyway`);

      break;
  }

  try {
    await this.install(appPath, Object.assign({}, options, {
      replace: true
    }));
  } catch (err) {
    _logger.default.warn(`Cannot install/upgrade '${pkg}' because of '${err.message}'. Trying full reinstall`);

    await uninstallPackage();
    await this.install(appPath, Object.assign({}, options, {
      replace: false
    }));
  }

  return {
    appState,
    wasUninstalled
  };
};

apkUtilsMethods.extractStringsFromApk = async function extractStringsFromApk(appPath, language, out) {
  _logger.default.debug(`Extracting strings from for language: ${language || 'default'}`);

  const originalAppPath = appPath;

  if (appPath.endsWith(_helpers.APKS_EXTENSION)) {
    appPath = await this.extractLanguageApk(appPath, language);
  }

  let apkStrings = {};
  let configMarker;

  try {
    await this.initAapt();
    configMarker = await (0, _helpers.formatConfigMarker)(async () => {
      const {
        stdout
      } = await (0, _teen_process.exec)(this.binaries.aapt, ['d', 'configurations', appPath]);
      return _lodash.default.uniq(stdout.split(_os.default.EOL));
    }, language, '(default)');
    const {
      stdout
    } = await (0, _teen_process.exec)(this.binaries.aapt, ['d', '--values', 'resources', appPath]);
    apkStrings = (0, _helpers.parseAaptStrings)(stdout, configMarker);
  } catch (e) {
    _logger.default.debug('Cannot extract resources using aapt. Trying aapt2. ' + `Original error: ${e.stderr || e.message}`);

    await this.initAapt2();
    configMarker = await (0, _helpers.formatConfigMarker)(async () => {
      const {
        stdout
      } = await (0, _teen_process.exec)(this.binaries.aapt2, ['d', 'configurations', appPath]);
      return _lodash.default.uniq(stdout.split(_os.default.EOL));
    }, language, '');

    try {
      const {
        stdout
      } = await (0, _teen_process.exec)(this.binaries.aapt2, ['d', 'resources', appPath]);
      apkStrings = (0, _helpers.parseAapt2Strings)(stdout, configMarker);
    } catch (e) {
      throw new Error(`Cannot extract resources from '${originalAppPath}'. ` + `Original error: ${e.message}`);
    }
  }

  if (_lodash.default.isEmpty(apkStrings)) {
    _logger.default.warn(`No strings have been found in '${originalAppPath}' resources ` + `for '${configMarker || 'default'}' configuration`);
  } else {
    _logger.default.info(`Successfully extracted ${_lodash.default.keys(apkStrings).length} strings from ` + `'${originalAppPath}' resources for '${configMarker || 'default'}' configuration`);
  }

  const localPath = _path.default.resolve(out, 'strings.json');

  await (0, _appiumSupport.mkdirp)(out);
  await _appiumSupport.fs.writeFile(localPath, JSON.stringify(apkStrings, null, 2), 'utf-8');
  return {
    apkStrings,
    localPath
  };
};

apkUtilsMethods.getDeviceLanguage = async function getDeviceLanguage() {
  let language;

  if ((await this.getApiLevel()) < 23) {
    language = await this.getDeviceSysLanguage();

    if (!language) {
      language = await this.getDeviceProductLanguage();
    }
  } else {
    language = (await this.getDeviceLocale()).split('-')[0];
  }

  return language;
};

apkUtilsMethods.getDeviceCountry = async function getDeviceCountry() {
  let country = await this.getDeviceSysCountry();

  if (!country) {
    country = await this.getDeviceProductCountry();
  }

  return country;
};

apkUtilsMethods.getDeviceLocale = async function getDeviceLocale() {
  let locale = await this.getDeviceSysLocale();

  if (!locale) {
    locale = await this.getDeviceProductLocale();
  }

  return locale;
};

apkUtilsMethods.setDeviceLocale = async function setDeviceLocale(locale) {
  const validateLocale = new RegExp(/[a-zA-Z]+-[a-zA-Z0-9]+/);

  if (!validateLocale.test(locale)) {
    _logger.default.warn(`setDeviceLocale requires the following format: en-US or ja-JP`);

    return;
  }

  let split_locale = locale.split('-');
  await this.setDeviceLanguageCountry(split_locale[0], split_locale[1]);
};

apkUtilsMethods.ensureCurrentLocale = async function ensureCurrentLocale(language, country, script = null) {
  const hasLanguage = _lodash.default.isString(language);

  const hasCountry = _lodash.default.isString(country);

  if (!hasLanguage && !hasCountry) {
    _logger.default.warn('ensureCurrentLocale requires language or country');

    return false;
  }

  language = (language || '').toLowerCase();
  country = (country || '').toLowerCase();
  const apiLevel = await this.getApiLevel();
  return await (0, _asyncbox.retryInterval)(5, 1000, async () => {
    try {
      if (apiLevel < 23) {
        let curLanguage, curCountry;

        if (hasLanguage) {
          curLanguage = (await this.getDeviceLanguage()).toLowerCase();

          if (!hasCountry && language === curLanguage) {
            return true;
          }
        }

        if (hasCountry) {
          curCountry = (await this.getDeviceCountry()).toLowerCase();

          if (!hasLanguage && country === curCountry) {
            return true;
          }
        }

        if (language === curLanguage && country === curCountry) {
          return true;
        }
      } else {
        const curLocale = (await this.getDeviceLocale()).toLowerCase();
        const localeCode = script ? `${language}-${script.toLowerCase()}-${country}` : `${language}-${country}`;

        if (localeCode === curLocale) {
          _logger.default.debug(`Requested locale is equal to current locale: '${curLocale}'`);

          return true;
        }
      }

      return false;
    } catch (err) {
      _logger.default.error(`Unable to check device localization: ${err.message}`);

      try {
        await this.reconnect();
      } catch (ign) {
        await this.restartAdb();
      }

      throw err;
    }
  });
};

apkUtilsMethods.setDeviceLanguageCountry = async function setDeviceLanguageCountry(language, country, script = null) {
  let hasLanguage = language && _lodash.default.isString(language);

  let hasCountry = country && _lodash.default.isString(country);

  if (!hasLanguage || !hasCountry) {
    _logger.default.warn(`setDeviceLanguageCountry requires language and country at least`);

    _logger.default.warn(`Got language: '${language}' and country: '${country}'`);

    return;
  }

  let apiLevel = await this.getApiLevel();
  language = (language || '').toLowerCase();
  country = (country || '').toUpperCase();

  if (apiLevel < 23) {
    let curLanguage = (await this.getDeviceLanguage()).toLowerCase();
    let curCountry = (await this.getDeviceCountry()).toUpperCase();

    if (language !== curLanguage || country !== curCountry) {
      await this.setDeviceSysLocaleViaSettingApp(language, country);
    }
  } else {
    let curLocale = await this.getDeviceLocale();
    const localeCode = script ? `${language}-${script}-${country}` : `${language}-${country}`;

    _logger.default.debug(`Current locale: '${curLocale}'; requested locale: '${localeCode}'`);

    if (localeCode.toLowerCase() !== curLocale.toLowerCase()) {
      await this.setDeviceSysLocaleViaSettingApp(language, country, script);
    }
  }
};

apkUtilsMethods.getApkInfo = async function getApkInfo(appPath) {
  if (!(await _appiumSupport.fs.exists(appPath))) {
    throw new Error(`The file at path ${appPath} does not exist or is not accessible`);
  }

  if (appPath.endsWith(_helpers.APKS_EXTENSION)) {
    appPath = await this.extractBaseApk(appPath);
  }

  try {
    const apkReader = await _adbkitApkreader.default.open(appPath);
    const manifest = await apkReader.readManifest();
    const {
      pkg,
      versionName,
      versionCode
    } = (0, _helpers.parseManifest)(manifest);
    return {
      name: pkg,
      versionCode,
      versionName
    };
  } catch (e) {
    _logger.default.warn(`Error '${e.message}' while getting badging info`);
  }

  return {};
};

apkUtilsMethods.getPackageInfo = async function getPackageInfo(pkg) {
  _logger.default.debug(`Getting package info for '${pkg}'`);

  let result = {
    name: pkg
  };

  try {
    const stdout = await this.shell(['dumpsys', 'package', pkg]);
    const versionNameMatch = new RegExp(/versionName=([\d+.]+)/).exec(stdout);

    if (versionNameMatch) {
      result.versionName = versionNameMatch[1];
    }

    const versionCodeMatch = new RegExp(/versionCode=(\d+)/).exec(stdout);

    if (versionCodeMatch) {
      result.versionCode = parseInt(versionCodeMatch[1], 10);
    }

    return result;
  } catch (err) {
    _logger.default.warn(`Error '${err.message}' while dumping package info`);
  }

  return result;
};

apkUtilsMethods.pullApk = async function pullApk(pkg, tmpDir) {
  const pkgPath = (await this.adbExec(['shell', 'pm', 'path', pkg])).replace('package:', '');

  const tmpApp = _path.default.resolve(tmpDir, `${pkg}.apk`);

  await this.pull(pkgPath, tmpApp);

  _logger.default.debug(`Pulled app for package '${pkg}' to '${tmpApp}'`);

  return tmpApp;
};

var _default = apkUtilsMethods;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi90b29scy9hcGstdXRpbHMuanMiXSwibmFtZXMiOlsiYXBrVXRpbHNNZXRob2RzIiwiQUNUSVZJVElFU19UUk9VQkxFU0hPT1RJTkdfTElOSyIsIkFQUF9JTlNUQUxMX1NUQVRFIiwiVU5LTk9XTiIsIk5PVF9JTlNUQUxMRUQiLCJORVdFUl9WRVJTSU9OX0lOU1RBTExFRCIsIlNBTUVfVkVSU0lPTl9JTlNUQUxMRUQiLCJPTERFUl9WRVJTSU9OX0lOU1RBTExFRCIsIlJFTU9URV9DQUNIRV9ST09UIiwiaXNBcHBJbnN0YWxsZWQiLCJwa2ciLCJsb2ciLCJkZWJ1ZyIsImluc3RhbGxlZFBhdHRlcm4iLCJSZWdFeHAiLCJfIiwiZXNjYXBlUmVnRXhwIiwic3Rkb3V0Iiwic2hlbGwiLCJpc0luc3RhbGxlZCIsInRlc3QiLCJlIiwiRXJyb3IiLCJtZXNzYWdlIiwic3RhcnRVcmkiLCJ1cmkiLCJvcHRzIiwid2FpdEZvckxhdW5jaCIsImFyZ3MiLCJwdXNoIiwicmVzIiwidG9Mb3dlckNhc2UiLCJpbmNsdWRlcyIsInN0YXJ0QXBwIiwic3RhcnRBcHBPcHRpb25zIiwiYWN0aXZpdHkiLCJhY3Rpb24iLCJjbG9uZSIsInJlcGxhY2UiLCJkZWZhdWx0cyIsIndhaXRQa2ciLCJ3YWl0QWN0aXZpdHkiLCJyZXRyeSIsInN0b3BBcHAiLCJhcGlMZXZlbCIsImdldEFwaUxldmVsIiwiY21kIiwiaW50ZW50TmFtZSIsIm9wdGlvbmFsSW50ZW50QXJndW1lbnRzIiwic2hlbGxPcHRzIiwiaXNJbnRlZ2VyIiwid2FpdER1cmF0aW9uIiwidGltZW91dCIsInN0YXJ0c1dpdGgiLCJ3YWl0Rm9yQWN0aXZpdHkiLCJhcHBEZXNjcmlwdG9yIiwiZHVtcFdpbmRvd3MiLCJkdW1wc3lzQXJnIiwiZ2V0Rm9jdXNlZFBhY2thZ2VBbmRBY3Rpdml0eSIsIm51bGxGb2N1c2VkQXBwUmUiLCJmb2N1c2VkQXBwUmUiLCJudWxsQ3VycmVudEZvY3VzUmUiLCJjdXJyZW50Rm9jdXNBcHBSZSIsInBhdHRlcm4iLCJtYXRjaCIsImV4ZWMiLCJhcHBQYWNrYWdlIiwidHJpbSIsImFwcEFjdGl2aXR5Iiwid2FpdEZvckFjdGl2aXR5T3JOb3QiLCJ3YWl0Rm9yU3RvcCIsIndhaXRNcyIsInNwbGl0TmFtZXMiLCJuYW1lcyIsInNwbGl0IiwibWFwIiwibmFtZSIsImFsbFBhY2thZ2VzIiwiYWxsQWN0aXZpdGllcyIsInBvc3NpYmxlQWN0aXZpdHlOYW1lcyIsIm9uZUFjdGl2aXR5IiwiY3VycmVudFBrZyIsImpvaW4iLCJwb3NzaWJsZUFjdGl2aXR5UGF0dGVybnMiLCJhY3ROYW1lIiwiY29uZGl0aW9uRnVuYyIsImZ1bGx5UXVhbGlmaWVkQWN0aXZpdHkiLCJpc0FjdGl2aXR5Rm91bmQiLCJzb21lIiwicCIsInBhcnNlSW50IiwiaW50ZXJ2YWxNcyIsImFjdCIsIndhaXRGb3JOb3RBY3Rpdml0eSIsInVuaW5zdGFsbEFwayIsIm9wdGlvbnMiLCJpbmZvIiwia2VlcERhdGEiLCJmb3JjZVN0b3AiLCJhZGJFeGVjIiwiaW5zdGFsbEZyb21EZXZpY2VQYXRoIiwiYXBrUGF0aE9uRGV2aWNlIiwiaW5kZXhPZiIsImNhY2hlQXBrIiwiYXBrUGF0aCIsImFwcEhhc2giLCJmcyIsImhhc2giLCJyZW1vdGVQYXRoIiwicGF0aCIsInBvc2l4IiwicmVtb3RlQ2FjaGVkRmlsZXMiLCJlcnJvck1hcmtlciIsImxzT3V0cHV0IiwiX2FyZUV4dGVuZGVkTHNPcHRpb25zU3VwcG9ydGVkIiwiaXNCb29sZWFuIiwiaXNTdHJpbmciLCJzdWJzdHJpbmciLCJ4IiwiZmlsdGVyIiwiQm9vbGVhbiIsImxlbmd0aCIsInRvSGFzaCIsInBhcnNlIiwiY2F0Y2giLCJ0aW1lciIsInRpbWluZyIsIlRpbWVyIiwic3RhcnQiLCJzaXplIiwic3RhdCIsImJhc2VuYW1lIiwidXRpbCIsInRvUmVhZGFibGVTaXplU3RyaW5nIiwiZ2V0RHVyYXRpb24iLCJhc01pbGxpU2Vjb25kcyIsInRvRml4ZWQiLCJyZW1vdGVBcHBzQ2FjaGUiLCJMUlUiLCJtYXgiLCJyZW1vdGVBcHBzQ2FjaGVMaW1pdCIsImRpZmZlcmVuY2UiLCJrZXlzIiwiZm9yRWFjaCIsImRlbCIsInNldCIsImVudHJpZXNUb0NsZWFudXAiLCJoYXMiLCJzbGljZSIsImlzRW1wdHkiLCJ3YXJuIiwiaW5zdGFsbCIsImFwcFBhdGgiLCJlbmRzV2l0aCIsIkFQS1NfRVhURU5TSU9OIiwiaW5zdGFsbEFwa3MiLCJjbG9uZURlZXAiLCJhZGJFeGVjVGltZW91dCIsIkRFRkFVTFRfQURCX0VYRUNfVElNRU9VVCIsIkFQS19JTlNUQUxMX1RJTUVPVVQiLCJ0aW1lb3V0Q2FwTmFtZSIsImluc3RhbGxBcmdzIiwibm9JbmNyZW1lbnRhbCIsImlzSW5jcmVtZW50YWxJbnN0YWxsU3VwcG9ydGVkIiwiaW5zdGFsbE9wdHMiLCJpbnN0YWxsQ21kIiwicGVyZm9ybUFwcEluc3RhbGwiLCJzaG91bGRDYWNoZUFwcCIsImlzU3RyZWFtZWRJbnN0YWxsU3VwcG9ydGVkIiwiY2xlYXJDYWNoZSIsImNhY2hlQXBwIiwiY2FjaGVkQXBwUGF0aCIsInBtSW5zdGFsbENtZEJ5UmVtb3RlUGF0aCIsIm91dHB1dCIsIm5ld0NhY2hlZEFwcFBhdGgiLCJ0cnVuY2F0ZWRPdXRwdXQiLCJzdWJzdHIiLCJpc1Rlc3RQYWNrYWdlT25seUVycm9yIiwibXNnIiwiZXJyIiwiZ2V0QXBwbGljYXRpb25JbnN0YWxsU3RhdGUiLCJhcGtJbmZvIiwiZ2V0QXBrSW5mbyIsInZlcnNpb25Db2RlIiwicGtnVmVyc2lvbkNvZGUiLCJ2ZXJzaW9uTmFtZSIsInBrZ1ZlcnNpb25OYW1lU3RyIiwiZ2V0UGFja2FnZUluZm8iLCJwa2dWZXJzaW9uTmFtZSIsInNlbXZlciIsInZhbGlkIiwiY29lcmNlIiwiYXBrVmVyc2lvbkNvZGUiLCJhcGtWZXJzaW9uTmFtZVN0ciIsImFwa1ZlcnNpb25OYW1lIiwic2F0aXNmaWVzIiwiaW5zdGFsbE9yVXBncmFkZSIsImVuZm9yY2VDdXJyZW50QnVpbGQiLCJhcHBTdGF0ZSIsIndhc1VuaW5zdGFsbGVkIiwidW5pbnN0YWxsUGFja2FnZSIsIk9iamVjdCIsImFzc2lnbiIsImV4dHJhY3RTdHJpbmdzRnJvbUFwayIsImxhbmd1YWdlIiwib3V0Iiwib3JpZ2luYWxBcHBQYXRoIiwiZXh0cmFjdExhbmd1YWdlQXBrIiwiYXBrU3RyaW5ncyIsImNvbmZpZ01hcmtlciIsImluaXRBYXB0IiwiYmluYXJpZXMiLCJhYXB0IiwidW5pcSIsIm9zIiwiRU9MIiwic3RkZXJyIiwiaW5pdEFhcHQyIiwiYWFwdDIiLCJsb2NhbFBhdGgiLCJyZXNvbHZlIiwid3JpdGVGaWxlIiwiSlNPTiIsInN0cmluZ2lmeSIsImdldERldmljZUxhbmd1YWdlIiwiZ2V0RGV2aWNlU3lzTGFuZ3VhZ2UiLCJnZXREZXZpY2VQcm9kdWN0TGFuZ3VhZ2UiLCJnZXREZXZpY2VMb2NhbGUiLCJnZXREZXZpY2VDb3VudHJ5IiwiY291bnRyeSIsImdldERldmljZVN5c0NvdW50cnkiLCJnZXREZXZpY2VQcm9kdWN0Q291bnRyeSIsImxvY2FsZSIsImdldERldmljZVN5c0xvY2FsZSIsImdldERldmljZVByb2R1Y3RMb2NhbGUiLCJzZXREZXZpY2VMb2NhbGUiLCJ2YWxpZGF0ZUxvY2FsZSIsInNwbGl0X2xvY2FsZSIsInNldERldmljZUxhbmd1YWdlQ291bnRyeSIsImVuc3VyZUN1cnJlbnRMb2NhbGUiLCJzY3JpcHQiLCJoYXNMYW5ndWFnZSIsImhhc0NvdW50cnkiLCJjdXJMYW5ndWFnZSIsImN1ckNvdW50cnkiLCJjdXJMb2NhbGUiLCJsb2NhbGVDb2RlIiwiZXJyb3IiLCJyZWNvbm5lY3QiLCJpZ24iLCJyZXN0YXJ0QWRiIiwidG9VcHBlckNhc2UiLCJzZXREZXZpY2VTeXNMb2NhbGVWaWFTZXR0aW5nQXBwIiwiZXhpc3RzIiwiZXh0cmFjdEJhc2VBcGsiLCJhcGtSZWFkZXIiLCJBcGtSZWFkZXIiLCJvcGVuIiwibWFuaWZlc3QiLCJyZWFkTWFuaWZlc3QiLCJyZXN1bHQiLCJ2ZXJzaW9uTmFtZU1hdGNoIiwidmVyc2lvbkNv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LG1CQUFYLEVBQWdDbUQsSUFBaEMsQ0FBcUNoRCxNQUFyQyxDQUF6Qjs7QUFDQSxRQUFJcVAsZ0JBQUosRUFBc0I7QUFDcEJGLE1BQUFBLE1BQU0sQ0FBQzdFLFdBQVAsR0FBcUI3RixRQUFRLENBQUM0SyxnQkFBZ0IsQ0FBQyxDQUFELENBQWpCLEVBQXNCLEVBQXRCLENBQTdCO0FBQ0Q7O0FBQ0QsV0FBT0YsTUFBUDtBQUNELEdBWEQsQ0FXRSxPQUFPakYsR0FBUCxFQUFZO0FBQ1p4SyxvQkFBSTJJLElBQUosQ0FBVSxVQUFTNkIsR0FBRyxDQUFDNUosT0FBUSw4QkFBL0I7QUFDRDs7QUFDRCxTQUFPNk8sTUFBUDtBQUNELENBbEJEOztBQW9CQXBRLGVBQWUsQ0FBQ3VRLE9BQWhCLEdBQTBCLGVBQWVBLE9BQWYsQ0FBd0I3UCxHQUF4QixFQUE2QjhQLE1BQTdCLEVBQXFDO0FBQzdELFFBQU1DLE9BQU8sR0FBRyxDQUFDLE1BQU0sS0FBS3RLLE9BQUwsQ0FBYSxDQUFDLE9BQUQsRUFBVSxJQUFWLEVBQWdCLE1BQWhCLEVBQXdCekYsR0FBeEIsQ0FBYixDQUFQLEVBQW1ENEIsT0FBbkQsQ0FBMkQsVUFBM0QsRUFBdUUsRUFBdkUsQ0FBaEI7O0FBQ0EsUUFBTW9PLE1BQU0sR0FBRzdKLGNBQUsrRyxPQUFMLENBQWE0QyxNQUFiLEVBQXNCLEdBQUU5UCxHQUFJLE1BQTVCLENBQWY7O0FBQ0EsUUFBTSxLQUFLaVEsSUFBTCxDQUFVRixPQUFWLEVBQW1CQyxNQUFuQixDQUFOOztBQUNBL1Asa0JBQUlDLEtBQUosQ0FBVywyQkFBMEJGLEdBQUksU0FBUWdRLE1BQU8sR0FBeEQ7O0FBQ0EsU0FBT0EsTUFBUDtBQUNELENBTkQ7O2VBU2UxUSxlIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgYnVpbGRTdGFydENtZCwgQVBLU19FWFRFTlNJT04sIGJ1aWxkSW5zdGFsbEFyZ3MsXG4gIEFQS19JTlNUQUxMX1RJTUVPVVQsIERFRkFVTFRfQURCX0VYRUNfVElNRU9VVCxcbiAgcGFyc2VNYW5pZmVzdCwgcGFyc2VBYXB0U3RyaW5ncywgcGFyc2VBYXB0MlN0cmluZ3MsIGZvcm1hdENvbmZpZ01hcmtlcixcbiAgZXNjYXBlU2hlbGxBcmcsXG59IGZyb20gJy4uL2hlbHBlcnMuanMnO1xuaW1wb3J0IHsgZXhlYyB9IGZyb20gJ3RlZW5fcHJvY2Vzcyc7XG5pbXBvcnQgbG9nIGZyb20gJy4uL2xvZ2dlci5qcyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyByZXRyeUludGVydmFsLCB3YWl0Rm9yQ29uZGl0aW9uIH0gZnJvbSAnYXN5bmNib3gnO1xuaW1wb3J0IHsgZnMsIHV0aWwsIG1rZGlycCwgdGltaW5nIH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuaW1wb3J0IHNlbXZlciBmcm9tICdzZW12ZXInO1xuaW1wb3J0IG9zIGZyb20gJ29zJztcbmltcG9ydCBMUlUgZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBBcGtSZWFkZXIgZnJvbSAnYWRia2l0LWFwa3JlYWRlcic7XG5cblxubGV0IGFwa1V0aWxzTWV0aG9kcyA9IHt9O1xuXG5jb25zdCBBQ1RJVklUSUVTX1RST1VCTEVTSE9PVElOR19MSU5LID1cbiAgJ2h0dHBzOi8vZ2l0aHViLmNvbS9hcHBpdW0vYXBwaXVtL2Jsb2IvbWFzdGVyL2RvY3MvZW4vd3JpdGluZy1ydW5uaW5nLWFwcGl1bS9hbmRyb2lkL2FjdGl2aXR5LXN0YXJ0dXAubWQnO1xuYXBrVXRpbHNNZXRob2RzLkFQUF9JTlNUQUxMX1NUQVRFID0ge1xuICBVTktOT1dOOiAndW5rbm93bicsXG4gIE5PVF9JTlNUQUxMRUQ6ICdub3RJbnN0YWxsZWQnLFxuICBORVdFUl9WRVJTSU9OX0lOU1RBTExFRDogJ25ld2VyVmVyc2lvbkluc3RhbGxlZCcsXG4gIFNBTUVfVkVSU0lPTl9JTlNUQUxMRUQ6ICdzYW1lVmVyc2lvbkluc3RhbGxlZCcsXG4gIE9MREVSX1ZFUlNJT05fSU5TVEFMTEVEOiAnb2xkZXJWZXJzaW9uSW5zdGFsbGVkJyxcbn07XG5jb25zdCBSRU1PVEVfQ0FDSEVfUk9PVCA9ICcvZGF0YS9sb2NhbC90bXAvYXBwaXVtX2NhY2hlJztcblxuXG4vKipcbiAqIENoZWNrIHdoZXRoZXIgdGhlIHBhcnRpY3VsYXIgcGFja2FnZSBpcyBwcmVzZW50IG9uIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGtnIC0gVGhlIG5hbWUgb2YgdGhlIHBhY2thZ2UgdG8gY2hlY2suXG4gKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBwYWNrYWdlIGlzIGluc3RhbGxlZC5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGVyZSB3YXMgYW4gZXJyb3Igd2hpbGUgZGV0ZWN0aW5nIGFwcGxpY2F0aW9uIHN0YXRlXG4gKi9cbmFwa1V0aWxzTWV0aG9kcy5pc0FwcEluc3RhbGxlZCA9IGFzeW5jIGZ1bmN0aW9uIGlzQXBwSW5zdGFsbGVkIChwa2cpIHtcbiAgbG9nLmRlYnVnKGBHZXR0aW5nIGluc3RhbGwgc3RhdHVzIGZvciAke3BrZ31gKTtcbiAgY29uc3QgaW5zdGFsbGVkUGF0dGVybiA9IG5ldyBSZWdFeHAoYF5cXFxccypQYWNrYWdlXFxcXHMrXFxcXFske18uZXNjYXBlUmVnRXhwKHBrZyl9XFxcXF1bXjpdKzokYCwgJ20nKTtcbiAgdHJ5IHtcbiAgICBjb25zdCBzdGRvdXQgPSBhd2FpdCB0aGlzLnNoZWxsKFsnZHVtcHN5cycsICdwYWNrYWdlJywgcGtnXSk7XG4gICAgY29uc3QgaXNJbnN0YWxsZWQgPSBpbnN0YWxsZWRQYXR0ZXJuLnRlc3Qoc3Rkb3V0KTtcbiAgICBsb2cuZGVidWcoYCcke3BrZ30nIGlzJHshaXNJbnN0YWxsZWQgPyAnIG5vdCcgOiAnJ30gaW5zdGFsbGVkYCk7XG4gICAgcmV0dXJuIGlzSW5zdGFsbGVkO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBFcnJvciBmaW5kaW5nIGlmICcke3BrZ30nIGlzIGluc3RhbGxlZC4gT3JpZ2luYWwgZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuICB9XG59O1xuXG4vKipcbiAqIEB0eXBlZGVmIHtPYmplY3R9IFN0YXJ0VXJpT3B0aW9uc1xuICogQHByb3BlcnR5IHs/Ym9vbGVhbn0gd2FpdEZvckxhdW5jaCBbdHJ1ZV0gLSBpZiBgZmFsc2VgIHRoZW4gYWRiIHdvbid0IHdhaXRcbiAqIGZvciB0aGUgc3RhcnRlZCBhY3Rpdml0eSB0byByZXR1cm4gdGhlIGNvbnRyb2xcbiAqL1xuXG4vKipcbiAqIFN0YXJ0IHRoZSBwYXJ0aWN1bGFyIFVSSSBvbiB0aGUgZGV2aWNlIHVuZGVyIHRlc3QuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHVyaSAtIFRoZSBuYW1lIG9mIFVSSSB0byBzdGFydC5cbiAqIEBwYXJhbSB7c3RyaW5nfSBwa2cgLSBUaGUgbmFtZSBvZiB0aGUgcGFja2FnZSB0byBzdGFydCB0aGUgVVJJIHdpdGguXG4gKiBAcGFyYW0ge1N0YXJ0VXJpT3B0aW9uc30gb3B0c1xuICovXG5hcGtVdGlsc01ldGhvZHMuc3RhcnRVcmkgPSBhc3luYyBmdW5jdGlvbiBzdGFydFVyaSAodXJpLCBwa2csIG9wdHMgPSB7fSkge1xuICBjb25zdCB7XG4gICAgd2FpdEZvckxhdW5jaCA9IHRydWUsXG4gIH0gPSBvcHRzO1xuXG4gIGlmICghdXJpIHx8ICFwa2cpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VSSSBhbmQgcGFja2FnZSBhcmd1bWVudHMgYXJlIHJlcXVpcmVkJyk7XG4gIH1cblxuICBjb25zdCBhcmdzID0gWydhbScsICdzdGFydCddO1xuICBpZiAod2FpdEZvckxhdW5jaCkge1xuICAgIGFyZ3MucHVzaCgnLVcnKTtcbiAgfVxuICBhcmdzLnB1c2goJy1hJywgJ2FuZHJvaWQuaW50ZW50LmFjdGlvbi5WSUVXJyxcbiAgICAnLWQnLCBlc2NhcGVTaGVsbEFyZyh1cmkpLFxuICAgIHBrZyk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnNoZWxsKGFyZ3MpO1xuICAgIGlmIChyZXMudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndW5hYmxlIHRvIHJlc29sdmUgaW50ZW50JykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihyZXMpO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgRXJyb3IgYXR0ZW1wdGluZyB0byBzdGFydCBVUkkuIE9yaWdpbmFsIGVycm9yOiAke2V9YCk7XG4gIH1cbn07XG5cbi8qKlxuICogQHR5cGVkZWYge09iamVjdH0gU3RhcnRBcHBPcHRpb25zXG4gKiBAcHJvcGVydHkgeyFzdHJpbmd9IHBrZyAtIFRoZSBuYW1lIG9mIHRoZSBhcHBsaWNhdGlvbiBwYWNrYWdlXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IGFjdGl2aXR5IC0gVGhlIG5hbWUgb2YgdGhlIG1haW4gYXBwbGljYXRpb24gYWN0aXZpdHkuXG4gKiBUaGlzIG9yIGFjdGlvbiBpcyByZXF1aXJlZCBpbiBvcmRlciB0byBiZSBhYmxlIHRvIGxhdW5jaCBhbiBhcHAuXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IGFjdGlvbiAtIFRoZSBuYW1lIG9mIHRoZSBpbnRlbnQgYWN0aW9uIHRoYXQgd2lsbCBsYXVuY2ggdGhlIHJlcXVpcmVkIGFwcC5cbiAqIFRoaXMgb3IgYWN0aXZpdHkgaXMgcmVxdWlyZWQgaW4gb3JkZXIgdG8gYmUgYWJsZSB0byBsYXVuY2ggYW4gYXBwLlxuICogQHByb3BlcnR5IHs/Ym9vbGVhbn0gcmV0cnkgW3RydWVdIC0gSWYgdGhpcyBwcm9wZXJ0eSBpcyBzZXQgdG8gYHRydWVgXG4gKiBhbmQgdGhlIGFjdGl2aXR5IG5hbWUgZG9lcyBub3Qgc3RhcnQgd2l0aCAnLicgdGhlbiB0aGUgbWV0aG9kXG4gKiB3aWxsIHRyeSB0byBhZGQgdGhlIG1pc3NpbmcgZG90IGFuZCBzdGFydCB0aGUgYWN0aXZpdHkgb25jZSBtb3JlXG4gKiBpZiB0aGUgZmlyc3Qgc3RhcnR1cCB0cnkgZmFpbHMuXG4gKiBAcHJvcGVydHkgez9ib29sZWFufSBzdG9wQXBwIFt0cnVlXSAtIFNldCBpdCB0byBgdHJ1ZWAgaW4gb3JkZXIgdG8gZm9yY2VmdWxseVxuICogc3RvcCB0aGUgYWN0aXZpdHkgaWYgaXQgaXMgYWxyZWFkeSBydW5uaW5nLlxuICogQHByb3BlcnR5IHs/c3RyaW5nfSB3YWl0UGtnIC0gVGhlIG5hbWUgb2YgdGhlIHBhY2thZ2UgdG8gd2FpdCB0byBvblxuICogc3RhcnR1cCAodGhpcyBvbmx5IG1ha2VzIHNlbnNlIGlmIHRoaXMgbmFtZSBpcyBkaWZmZXJlbnQgZnJvbSB0aGUgb25lLCB3aGljaCBpcyBzZXQgYXMgYHBrZ2ApXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IHdhaXRBY3Rpdml0eSAtIFRoZSBuYW1lIG9mIHRoZSBhY3Rpdml0eSB0byB3YWl0IHRvIG9uXG4gKiBzdGFydHVwICh0aGlzIG9ubHkgbWFrZXMgc2Vuc2UgaWYgdGhpcyBuYW1lIGlzIGRpZmZlcmVudCBmcm9tIHRoZSBvbmUsIHdoaWNoIGlzIHNldCBhcyBgYWN0aXZpdHlgKVxuICogQHByb3BlcnR5IHs/bnVtYmVyfSB3YWl0RHVyYXRpb24gLSBUaGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byB3YWl0IHVudGlsIHRoZVxuICogYHdhaXRBY3Rpdml0eWAgaXMgZm9jdXNlZFxuICogQHByb3BlcnR5IHs/c3RyaW5nfG51bWJlcn0gdXNlciAtIFRoZSBudW1iZXIgb2YgdGhlIHVzZXIgcHJvZmlsZSB0byBzdGFydFxuICogdGhlIGdpdmVuIGFjdGl2aXR5IHdpdGguIFRoZSBkZWZhdWx0IE9TIHVzZXIgcHJvZmlsZSAodXN1YWxseSB6ZXJvKSBpcyB1c2VkXG4gKiB3aGVuIHRoaXMgcHJvcGVydHkgaXMgdW5zZXRcbiAqIEBwcm9wZXJ0eSB7P2Jvb2xlYW59IHdhaXRGb3JMYXVuY2ggW3RydWVdIC0gaWYgYGZhbHNlYCB0aGVuIGFkYiB3b24ndCB3YWl0XG4gKiBmb3IgdGhlIHN0YXJ0ZWQgYWN0aXZpdHkgdG8gcmV0dXJuIHRoZSBjb250cm9sXG4gKi9cblxuLyoqXG4gKiBTdGFydCB0aGUgcGFydGljdWxhciBwYWNrYWdlL2FjdGl2aXR5IG9uIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqXG4gKiBAcGFyYW0ge1N0YXJ0QXBwT3B0aW9uc30gc3RhcnRBcHBPcHRpb25zIFt7fV0gLSBTdGFydHVwIG9wdGlvbnMgbWFwcGluZy5cbiAqIEByZXR1cm4ge3N0cmluZ30gVGhlIG91dHB1dCBvZiB0aGUgY29ycmVzcG9uZGluZyBhZGIgY29tbWFuZC5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGVyZSBpcyBhbiBlcnJvciB3aGlsZSBleGVjdXRpbmcgdGhlIGFjdGl2aXR5XG4gKi9cbmFwa1V0aWxzTWV0aG9kcy5zdGFydEFwcCA9IGFzeW5jIGZ1bmN0aW9uIHN0YXJ0QXBwIChzdGFydEFwcE9wdGlvbnMgPSB7fSkge1xuICBpZiAoIXN0YXJ0QXBwT3B0aW9ucy5wa2cgfHwgIShzdGFydEFwcE9wdGlvbnMuYWN0aXZpdHkgfHwgc3RhcnRBcHBPcHRpb25zLmFjdGlvbikpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3BrZywgYW5kIGFjdGl2aXR5IG9yIGludGVudCBhY3Rpb24sIGFyZSByZXF1aXJlZCB0byBzdGFydCBhbiBhcHBsaWNhdGlvbicpO1xuICB9XG5cbiAgc3RhcnRBcHBPcHRpb25zID0gXy5jbG9uZShzdGFydEFwcE9wdGlvbnMpO1xuICBpZiAoc3RhcnRBcHBPcHRpb25zLmFjdGl2aXR5KSB7XG4gICAgc3RhcnRBcHBPcHRpb25zLmFjdGl2aXR5ID0gc3RhcnRBcHBPcHRpb25zLmFjdGl2aXR5LnJlcGxhY2UoJyQnLCAnXFxcXCQnKTtcbiAgfVxuICAvLyBpbml0aWFsaXppbmcgZGVmYXVsdHNcbiAgXy5kZWZhdWx0cyhzdGFydEFwcE9wdGlvbnMsIHtcbiAgICB3YWl0UGtnOiBzdGFydEFwcE9wdGlvbnMucGtnLFxuICAgIHdhaXRGb3JMYXVuY2g6IHRydWUsXG4gICAgd2FpdEFjdGl2aXR5OiBmYWxzZSxcbiAgICByZXRyeTogdHJ1ZSxcbiAgICBzdG9wQXBwOiB0cnVlXG4gIH0pO1xuICAvLyBwcmV2ZW50aW5nIG51bGwgd2FpdHBrZ1xuICBzdGFydEFwcE9wdGlvbnMud2FpdFBrZyA9IHN0YXJ0QXBwT3B0aW9ucy53YWl0UGtnIHx8IHN0YXJ0QXBwT3B0aW9ucy5wa2c7XG5cbiAgY29uc3QgYXBpTGV2ZWwgPSBhd2FpdCB0aGlzLmdldEFwaUxldmVsKCk7XG4gIGNvbnN0IGNtZCA9IGJ1aWxkU3RhcnRDbWQoc3RhcnRBcHBPcHRpb25zLCBhcGlMZXZlbCk7XG4gIGNvbnN0IGludGVudE5hbWUgPSBgJHtzdGFydEFwcE9wdGlvbnMuYWN0aW9ufSR7c3RhcnRBcHBPcHRpb25zLm9wdGlvbmFsSW50ZW50QXJndW1lbnRzID8gJyAnICsgc3RhcnRBcHBPcHRpb25zLm9wdGlvbmFsSW50ZW50QXJndW1lbnRzIDogJyd9YDtcbiAgdHJ5IHtcbiAgICBjb25zdCBzaGVsbE9wdHMgPSB7fTtcbiAgICBpZiAoXy5pc0ludGVnZXIoc3RhcnRBcHBPcHRpb25zLndhaXREdXJhdGlvbikgJiYgc3RhcnRBcHBPcHRpb25zLndhaXREdXJhdGlvbiA+PSAwKSB7XG4gICAgICBzaGVsbE9wdHMudGltZW91dCA9IHN0YXJ0QXBwT3B0aW9ucy53YWl0RHVyYXRpb247XG4gICAgfVxuICAgIGNvbnN0IHN0ZG91dCA9IGF3YWl0IHRoaXMuc2hlbGwoY21kLCBzaGVsbE9wdHMpO1xuICAgIGlmIChzdGRvdXQuaW5jbHVkZXMoJ0Vycm9yOiBBY3Rpdml0eSBjbGFzcycpICYmIHN0ZG91dC5pbmNsdWRlcygnZG9lcyBub3QgZXhpc3QnKSkge1xuICAgICAgaWYgKHN0YXJ0QXBwT3B0aW9ucy5yZXRyeSAmJiAhc3RhcnRBcHBPcHRpb25zLmFjdGl2aXR5LnN0YXJ0c1dpdGgoJy4nKSkge1xuICAgICAgICBsb2cuZGVidWcoYFdlIHRyaWVkIHRvIHN0YXJ0IGFuIGFjdGl2aXR5IHRoYXQgZG9lc24ndCBleGlzdCwgYCArXG4gICAgICAgICAgICAgICAgICBgcmV0cnlpbmcgd2l0aCAnLiR7c3RhcnRBcHBPcHRpb25zLmFjdGl2aXR5fScgYWN0aXZpdHkgbmFtZWApO1xuICAgICAgICBzdGFydEFwcE9wdGlvbnMuYWN0aXZpdHkgPSBgLiR7c3RhcnRBcHBPcHRpb25zLmFjdGl2aXR5fWA7XG4gICAgICAgIHN0YXJ0QXBwT3B0aW9ucy5yZXRyeSA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5zdGFydEFwcChzdGFydEFwcE9wdGlvbnMpO1xuICAgICAgfVxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBBY3Rpdml0eSBuYW1lICcke3N0YXJ0QXBwT3B0aW9ucy5hY3Rpdml0eX0nIHVzZWQgdG8gc3RhcnQgdGhlIGFwcCBkb2Vzbid0IGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGBleGlzdCBvciBjYW5ub3QgYmUgbGF1bmNoZWQhIE1ha2Ugc3VyZSBpdCBleGlzdHMgYW5kIGlzIGEgbGF1bmNoYWJsZSBhY3Rpdml0eWApO1xuICAgIH0gZWxzZSBpZiAoc3Rkb3V0LmluY2x1ZGVzKCdFcnJvcjogSW50ZW50IGRvZXMgbm90IG1hdGNoIGFueSBhY3Rpdml0aWVzJykgfHwgc3Rkb3V0LmluY2x1ZGVzKCdFcnJvcjogQWN0aXZpdHkgbm90IHN0YXJ0ZWQsIHVuYWJsZSB0byByZXNvbHZlIEludGVudCcpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEFjdGl2aXR5IGZvciBpbnRlbnQgJyR7aW50ZW50TmFtZX0nIHVzZWQgdG8gc3RhcnQgdGhlIGFwcCBkb2Vzbid0IGAgK1xuICAgICAgICAgICAgICAgICAgICAgIGBleGlzdCBvciBjYW5ub3QgYmUgbGF1bmNoZWQhIE1ha2Ugc3VyZSBpdCBleGlzdHMgYW5kIGlzIGEgbGF1bmNoYWJsZSBhY3Rpdml0eWApO1xuICAgIH0gZWxzZSBpZiAoc3Rkb3V0LmluY2x1ZGVzKCdqYXZhLmxhbmcuU2VjdXJpdHlFeGNlcHRpb24nKSkge1xuICAgICAgLy8gaWYgdGhlIGFwcCBpcyBkaXNhYmxlZCBvbiBhIHJlYWwgZGV2aWNlIGl0IHdpbGwgdGhyb3cgYSBzZWN1cml0eSBleGNlcHRpb25cbiAgICAgIHRocm93IG5ldyBFcnJvcihgVGhlIHBlcm1pc3Npb24gdG8gc3RhcnQgJyR7c3RhcnRBcHBPcHRpb25zLmFjdGl2aXR5fScgYWN0aXZpdHkgaGFzIGJlZW4gZGVuaWVkLmAgK1xuICAgICAgICAgICAgICAgICAgICAgIGBNYWtlIHN1cmUgdGhlIGFjdGl2aXR5L3BhY2thZ2UgbmFtZXMgYXJlIGNvcnJlY3QuYCk7XG4gICAgfVxuICAgIGlmIChzdGFydEFwcE9wdGlvbnMud2FpdEFjdGl2aXR5KSB7XG4gICAgICBhd2FpdCB0aGlzLndhaXRGb3JBY3Rpdml0eShzdGFydEFwcE9wdGlvbnMud2FpdFBrZywgc3RhcnRBcHBPcHRpb25zLndhaXRBY3Rpdml0eSwgc3RhcnRBcHBPcHRpb25zLndhaXREdXJhdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBzdGRvdXQ7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zdCBhcHBEZXNjcmlwdG9yID0gc3RhcnRBcHBPcHRpb25zLnBrZyB8fCBpbnRlbnROYW1lO1xuICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHN0YXJ0IHRoZSAnJHthcHBEZXNjcmlwdG9yfScgYXBwbGljYXRpb24uIGAgK1xuICAgICAgYFZpc2l0ICR7QUNUSVZJVElFU19UUk9VQkxFU0hPT1RJTkdfTElOS30gZm9yIHRyb3VibGVzaG9vdGluZy4gYCArXG4gICAgICBgT3JpZ2luYWwgZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuICB9XG59O1xuXG4vKipcbiAqIEhlbHBlciBtZXRob2QgdG8gY2FsbCBgYWRiIGR1bXBzeXMgd2luZG93IHdpbmRvd3MvZGlzcGxheXNgXG4gKi9cbmFwa1V0aWxzTWV0aG9kcy5kdW1wV2luZG93cyA9IGFzeW5jIGZ1bmN0aW9uIGR1bXBXaW5kb3dzICgpIHtcbiAgY29uc3QgYXBpTGV2ZWwgPSBhd2FpdCB0aGlzLmdldEFwaUxldmVsKCk7XG5cbiAgLy8gV2l0aCB2ZXJzaW9uIDI5LCBBbmRyb2lkIGNoYW5nZWQgdGhlIGR1bXBzeXMgc3ludGF4XG4gIGNvbnN0IGR1bXBzeXNBcmcgPSBhcGlMZXZlbCA+PSAyOSA/ICdkaXNwbGF5cycgOiAnd2luZG93cyc7XG4gIGNvbnN0IGNtZCA9IFsnZHVtcHN5cycsICd3aW5kb3cnLCBkdW1wc3lzQXJnXTtcblxuICByZXR1cm4gYXdhaXQgdGhpcy5zaGVsbChjbWQpO1xufTtcblxuLyoqXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBQYWNrYWdlQWN0aXZpdHlJbmZvXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IGFwcFBhY2thZ2UgLSBUaGUgbmFtZSBvZiBhcHBsaWNhdGlvbiBwYWNrYWdlLFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIGV4YW1wbGUgJ2NvbS5hY21lLmFwcCcuXG4gKiBAcHJvcGVydHkgez9zdHJpbmd9IGFwcEFjdGl2aXR5IC0gVGhlIG5hbWUgb2YgbWFpbiBhcHBsaWNhdGlvbiBhY3Rpdml0eS5cbiAqL1xuXG4vKipcbiAqIEdldCB0aGUgbmFtZSBvZiBjdXJyZW50bHkgZm9jdXNlZCBwYWNrYWdlIGFuZCBhY3Rpdml0eS5cbiAqXG4gKiBAcmV0dXJuIHtQYWNrYWdlQWN0aXZpdHlJbmZvfSBUaGUgbWFwcGluZywgd2hlcmUgcHJvcGVydHkgbmFtZXMgYXJlICdhcHBQYWNrYWdlJyBhbmQgJ2FwcEFjdGl2aXR5Jy5cbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGVyZSBpcyBhbiBlcnJvciB3aGlsZSBwYXJzaW5nIHRoZSBkYXRhLlxuICovXG5hcGtVdGlsc01ldGhvZHMuZ2V0Rm9jdXNlZFBhY2thZ2VBbmRBY3Rpdml0eSA9IGFzeW5jIGZ1bmN0aW9uIGdldEZvY3VzZWRQYWNrYWdlQW5kQWN0aXZpdHkgKCkge1xuICBsb2cuZGVidWcoJ0dldHRpbmcgZm9jdXNlZCBwYWNrYWdlIGFuZCBhY3Rpdml0eScpO1xuICBjb25zdCBudWxsRm9jdXNlZEFwcFJlID0gbmV3IFJlZ0V4cCgvXlxccyptRm9jdXNlZEFwcD1udWxsLywgJ20nKTtcbiAgLy8gaHR0cHM6Ly9yZWdleDEwMS5jb20vci94Wjh2RjcvMVxuICBjb25zdCBmb2N1c2VkQXBwUmUgPSBuZXcgUmVnRXhwKCdeXFxcXHMqbUZvY3VzZWRBcHAuK1JlY29yZFxcXFx7LipcXFxccyhbXlxcXFxzXFxcXC9cXFxcfV0rKScgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdcXFxcLyhbXlxcXFxzXFxcXC9cXFxcfVxcXFwsXSspXFxcXCw/KFxcXFxzW15cXFxcc1xcXFwvXFxcXH1dKykqXFxcXH0nLCAnbScpO1xuICBjb25zdCBudWxsQ3VycmVudEZvY3VzUmUgPSBuZXcgUmVnRXhwKC9eXFxzKm1DdXJyZW50Rm9jdXM9bnVsbC8sICdtJyk7XG4gIGNvbnN0IGN1cnJlbnRGb2N1c0FwcFJlID0gbmV3IFJlZ0V4cCgnXlxcXFxzKm1DdXJyZW50Rm9jdXMuK1xcXFx7LitcXFxccyhbXlxcXFxzXFxcXC9dKylcXFxcLyhbXlxcXFxzXSspXFxcXGInLCAnbScpO1xuXG4gIHRyeSB7XG4gICAgY29uc3Qgc3Rkb3V0ID0gYXdhaXQgdGhpcy5kdW1wV2luZG93cygpO1xuICAgIC8vIFRoZSBvcmRlciBtYXR0ZXJzIGhlcmVcbiAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgW2ZvY3VzZWRBcHBSZSwgY3VycmVudEZvY3VzQXBwUmVdKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IHBhdHRlcm4uZXhlYyhzdGRvdXQpO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgYXBwUGFja2FnZTogbWF0Y2hbMV0udHJpbSgpLFxuICAgICAgICAgIGFwcEFjdGl2aXR5OiBtYXRjaFsyXS50cmltKClcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgW251bGxGb2N1c2VkQXBwUmUsIG51bGxDdXJyZW50Rm9jdXNSZV0pIHtcbiAgICAgIGlmIChwYXR0ZXJuLmV4ZWMoc3Rkb3V0KSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGFwcFBhY2thZ2U6IG51bGwsXG4gICAgICAgICAgYXBwQWN0aXZpdHk6IG51bGxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBwYXJzZSBhY3Rpdml0eSBmcm9tIGR1bXBzeXMnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGdldCBmb2N1c1BhY2thZ2VBbmRBY3Rpdml0eS4gT3JpZ2luYWwgZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuICB9XG59O1xuXG4vKipcbiAqIFdhaXQgZm9yIHRoZSBnaXZlbiBhY3Rpdml0eSB0byBiZSBmb2N1c2VkL25vbi1mb2N1c2VkLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBwa2cgLSBUaGUgbmFtZSBvZiB0aGUgcGFja2FnZSB0byB3YWl0IGZvci5cbiAqIEBwYXJhbSB7c3RyaW5nfSBhY3Rpdml0eSAtIFRoZSBuYW1lIG9mIHRoZSBhY3Rpdml0eSwgYmVsb25naW5nIHRvIHRoYXQgcGFja2FnZSxcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvIHdhaXQgZm9yLlxuICogQHBhcmFtIHtib29sZWFufSB3YWl0Rm9yU3RvcCAtIFdoZXRoZXIgdG8gd2FpdCB1bnRpbCB0aGUgYWN0aXZpdHkgaXMgZm9jdXNlZCAodHJ1ZSlcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvciBpcyBub3QgZm9jdXNlZCAoZmFsc2UpLlxuICogQHBhcmFtIHtudW1iZXJ9IHdhaXRNcyBbMjAwMDBdIC0gTnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byB3YWl0IGJlZm9yZSB0aW1lb3V0IG9jY3Vycy5cbiAqIEB0aHJvd3Mge2Vycm9yfSBJZiB0aW1lb3V0IGhhcHBlbnMuXG4gKi9cbmFwa1V0aWxzTWV0aG9kcy53YWl0Rm9yQWN0aXZpdHlPck5vdCA9IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JBY3Rpdml0eU9yTm90IChwa2csIGFjdGl2aXR5LCB3YWl0Rm9yU3RvcCwgd2FpdE1zID0gMjAwMDApIHtcbiAgaWYgKCFwa2cgfHwgIWFjdGl2aXR5KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdQYWNrYWdlIGFuZCBhY3Rpdml0eSByZXF1aXJlZC4nKTtcbiAgfVxuICBsb2cuZGVidWcoYFdhaXRpbmcgdXAgdG8gJHt3YWl0TXN9bXMgZm9yIGFjdGl2aXR5IG1hdGNoaW5nIHBrZzogJyR7cGtnfScgYW5kIGAgK1xuICAgICAgICAgICAgYGFjdGl2aXR5OiAnJHthY3Rpdml0eX0nIHRvJHt3YWl0Rm9yU3RvcCA/ICcgbm90JyA6ICcnfSBiZSBmb2N1c2VkYCk7XG5cbiAgY29uc3Qgc3BsaXROYW1lcyA9IChuYW1lcykgPT4gbmFtZXMuc3BsaXQoJywnKS5tYXAoKG5hbWUpID0+IG5hbWUudHJpbSgpKTtcbiAgY29uc3QgYWxsUGFja2FnZXMgPSBzcGxpdE5hbWVzKHBrZyk7XG4gIGNvbnN0IGFsbEFjdGl2aXRpZXMgPSBzcGxpdE5hbWVzKGFjdGl2aXR5KTtcblxuICBjb25zdCBwb3NzaWJsZUFjdGl2aXR5TmFtZXMgPSBbXTtcbiAgZm9yIChjb25zdCBvbmVBY3Rpdml0eSBvZiBhbGxBY3Rpdml0aWVzKSB7XG4gICAgaWYgKG9uZUFjdGl2aXR5LnN0YXJ0c1dpdGgoJy4nKSkge1xuICAgICAgLy8gYWRkIHRoZSBwYWNrYWdlIG5hbWUgaWYgYWN0aXZpdHkgaXMgbm90IGZ1bGwgcXVhbGlmaWVkXG4gICAgICBmb3IgKGNvbnN0IGN1cnJlbnRQa2cgb2YgYWxsUGFja2FnZXMpIHtcbiAgICAgICAgcG9zc2libGVBY3Rpdml0eU5hbWVzLnB1c2goYCR7Y3VycmVudFBrZ30ke29uZUFjdGl2aXR5fWAucmVwbGFjZSgvXFwuKy9nLCAnLicpKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gYWNjZXB0IGZ1bGx5IHF1YWxpZmllZCBhY3Rpdml0eSBuYW1lLlxuICAgICAgcG9zc2libGVBY3Rpdml0eU5hbWVzLnB1c2gob25lQWN0aXZpdHkpO1xuICAgICAgcG9zc2libGVBY3Rpdml0eU5hbWVzLnB1c2goYCR7cGtnfS4ke29uZUFjdGl2aXR5fWApO1xuICAgIH1cbiAgfVxuICBsb2cuZGVidWcoYFBvc3NpYmxlIGFjdGl2aXRpZXMsIHRvIGJlIGNoZWNrZWQ6ICR7cG9zc2libGVBY3Rpdml0eU5hbWVzLm1hcCgobmFtZSkgPT4gYCcke25hbWV9J2ApLmpvaW4oJywgJyl9YCk7XG5cbiAgY29uc3QgcG9zc2libGVBY3Rpdml0eVBhdHRlcm5zID0gcG9zc2libGVBY3Rpdml0eU5hbWVzLm1hcChcbiAgICAoYWN0TmFtZSkgPT4gbmV3IFJlZ0V4cChgXiR7YWN0TmFtZS5yZXBsYWNlKC9cXC4vZywgJ1xcXFwuJykucmVwbGFjZSgvXFwqL2csICcuKj8nKS5yZXBsYWNlKC9cXCQvZywgJ1xcXFwkJyl9JGApXG4gICk7XG5cbiAgY29uc3QgY29uZGl0aW9uRnVuYyA9IGFzeW5jICgpID0+IHtcbiAgICBsZXQgYXBwUGFja2FnZTtcbiAgICBsZXQgYXBwQWN0aXZpdHk7XG4gICAgdHJ5IHtcbiAgICAgICh7YXBwUGFja2FnZSwgYXBwQWN0aXZpdHl9ID0gYXdhaXQgdGhpcy5nZXRGb2N1c2VkUGFja2FnZUFuZEFjdGl2aXR5KCkpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZy5kZWJ1ZyhlLm1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoYXBwQWN0aXZpdHkgJiYgYXBwUGFja2FnZSkge1xuICAgICAgY29uc3QgZnVsbHlRdWFsaWZpZWRBY3Rpdml0eSA9IGFwcEFjdGl2aXR5LnN0YXJ0c1dpdGgoJy4nKSA/IGAke2FwcFBhY2thZ2V9JHthcHBBY3Rpdml0eX1gIDogYXBwQWN0aXZpdHk7XG4gICAgICBsb2cuZGVidWcoYEZvdW5kIHBhY2thZ2U6ICcke2FwcFBhY2thZ2V9JyBhbmQgZnVsbHkgcXVhbGlmaWVkIGFjdGl2aXR5IG5hbWUgOiAnJHtmdWxseVF1YWxpZmllZEFjdGl2aXR5fSdgKTtcbiAgICAgIGNvbnN0IGlzQWN0aXZpdHlGb3VuZCA9IF8uaW5jbHVkZXMoYWxsUGFja2FnZXMsIGFwcFBhY2thZ2UpXG4gICAgICAgICYmIHBvc3NpYmxlQWN0aXZpdHlQYXR0ZXJucy5zb21lKChwKSA9PiBwLnRlc3QoZnVsbHlRdWFsaWZpZWRBY3Rpdml0eSkpO1xuICAgICAgaWYgKCghd2FpdEZvclN0b3AgJiYgaXNBY3Rpdml0eUZvdW5kKSB8fCAod2FpdEZvclN0b3AgJiYgIWlzQWN0aXZpdHlGb3VuZCkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuICAgIGxvZy5kZWJ1ZygnSW5jb3JyZWN0IHBhY2thZ2UgYW5kIGFjdGl2aXR5LiBSZXRyeWluZy4nKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGNvbmRpdGlvbkZ1bmMsIHtcbiAgICAgIHdhaXRNczogcGFyc2VJbnQod2FpdE1zLCAxMCksXG4gICAgICBpbnRlcnZhbE1zOiA1MDAsXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7cG9zc2libGVBY3Rpdml0eU5hbWVzLm1hcCgobmFtZSkgPT4gYCcke25hbWV9J2ApLmpvaW4oJyBvciAnKX0gbmV2ZXIgJHt3YWl0Rm9yU3RvcCA/ICdzdG9wcGVkJyA6ICdzdGFydGVkJ30uIGAgK1xuICAgICAgYFZpc2l0ICR7QUNUSVZJVElFU19UUk9VQkxFU0hPT1RJTkdfTElOS30gZm9yIHRyb3VibGVzaG9vdGluZ2ApO1xuICB9XG59O1xuXG4vKipcbiAqIFdhaXQgZm9yIHRoZSBnaXZlbiBhY3Rpdml0eSB0byBiZSBmb2N1c2VkXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHBrZyAtIFRoZSBuYW1lIG9mIHRoZSBwYWNrYWdlIHRvIHdhaXQgZm9yLlxuICogQHBhcmFtIHtzdHJpbmd9IGFjdGl2aXR5IC0gVGhlIG5hbWUgb2YgdGhlIGFjdGl2aXR5LCBiZWxvbmdpbmcgdG8gdGhhdCBwYWNrYWdlLFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgdG8gd2FpdCBmb3IuXG4gKiBAcGFyYW0ge251bWJlcn0gd2FpdE1zIFsyMDAwMF0gLSBOdW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIHdhaXQgYmVmb3JlIHRpbWVvdXQgb2NjdXJzLlxuICogQHRocm93cyB7ZXJyb3J9IElmIHRpbWVvdXQgaGFwcGVucy5cbiAqL1xuYXBrVXRpbHNNZXRob2RzLndhaXRGb3JBY3Rpdml0eSA9IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JBY3Rpdml0eSAocGtnLCBhY3QsIHdhaXRNcyA9IDIwMDAwKSB7XG4gIGF3YWl0IHRoaXMud2FpdEZvckFjdGl2aXR5T3JOb3QocGtnLCBhY3QsIGZhbHNlLCB3YWl0TXMpO1xufTtcblxuLyoqXG4gKiBXYWl0IGZvciB0aGUgZ2l2ZW4gYWN0aXZpdHkgdG8gYmUgbm9uLWZvY3VzZWQuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHBrZyAtIFRoZSBuYW1lIG9mIHRoZSBwYWNrYWdlIHRvIHdhaXQgZm9yLlxuICogQHBhcmFtIHtzdHJpbmd9IGFjdGl2aXR5IC0gVGhlIG5hbWUgb2YgdGhlIGFjdGl2aXR5LCBiZWxvbmdpbmcgdG8gdGhhdCBwYWNrYWdlLFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgdG8gd2FpdCBmb3IuXG4gKiBAcGFyYW0ge251bWJlcn0gd2FpdE1zIFsyMDAwMF0gLSBOdW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIHdhaXQgYmVmb3JlIHRpbWVvdXQgb2NjdXJzLlxuICogQHRocm93cyB7ZXJyb3J9IElmIHRpbWVvdXQgaGFwcGVucy5cbiAqL1xuYXBrVXRpbHNNZXRob2RzLndhaXRGb3JOb3RBY3Rpdml0eSA9IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JOb3RBY3Rpdml0eSAocGtnLCBhY3QsIHdhaXRNcyA9IDIwMDAwKSB7XG4gIGF3YWl0IHRoaXMud2FpdEZvckFjdGl2aXR5T3JOb3QocGtnLCBhY3QsIHRydWUsIHdhaXRNcyk7XG59O1xuXG4vKipcbiAqIEB0eXBlZGVmIHtPYmplY3R9IFVuaW5zdGFsbE9wdGlvbnNcbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSB0aW1lb3V0IFthZGJFeGVjVGltZW91dF0gLSBUaGUgY291bnQgb2YgbWlsbGlzZWNvbmRzIHRvIHdhaXQgdW50aWwgdGhlXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBwIGlzIHVuaW5zdGFsbGVkLlxuICogQHByb3BlcnR5IHtib29sZWFufSBrZWVwRGF0YSBbZmFsc2VdIC0gU2V0IHRvIHRydWUgaW4gb3JkZXIgdG8ga2VlcCB0aGVcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwcGxpY2F0aW9uIGRhdGEgYW5kIGNhY2hlIGZvbGRlcnMgYWZ0ZXIgdW5pbnN0YWxsLlxuICovXG5cbi8qKlxuICogVW5pbnN0YWxsIHRoZSBnaXZlbiBwYWNrYWdlIGZyb20gdGhlIGRldmljZSB1bmRlciB0ZXN0LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBwa2cgLSBUaGUgbmFtZSBvZiB0aGUgcGFja2FnZSB0byBiZSB1bmluc3RhbGxlZC5cbiAqIEBwYXJhbSB7P1VuaW5zdGFsbE9wdGlvbnN9IG9wdGlvbnMgLSBUaGUgc2V0IG9mIHVuaW5zdGFsbCBvcHRpb25zLlxuICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgcGFja2FnZSB3YXMgZm91bmQgb24gdGhlIGRldmljZSBhbmRcbiAqICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3NmdWxseSB1bmluc3RhbGxlZC5cbiAqL1xuYXBrVXRpbHNNZXRob2RzLnVuaW5zdGFsbEFwayA9IGFzeW5jIGZ1bmN0aW9uIHVuaW5zdGFsbEFwayAocGtnLCBvcHRpb25zID0ge30pIHtcbiAgbG9nLmRlYnVnKGBVbmluc3RhbGxpbmcgJHtwa2d9YCk7XG4gIGlmICghYXdhaXQgdGhpcy5pc0FwcEluc3RhbGxlZChwa2cpKSB7XG4gICAgbG9nLmluZm8oYCR7cGtnfSB3YXMgbm90IHVuaW5zdGFsbGVkLCBiZWNhdXNlIGl0IHdhcyBub3QgcHJlc2VudCBvbiB0aGUgZGV2aWNlYCk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgY21kID0gWyd1bmluc3RhbGwnXTtcbiAgaWYgKG9wdGlvbnMua2VlcERhdGEpIHtcbiAgICBjbWQucHVzaCgnLWsnKTtcbiAgfVxuICBjbWQucHVzaChwa2cpO1xuXG4gIGxldCBzdGRvdXQ7XG4gIHRyeSB7XG4gICAgYXdhaXQgdGhpcy5mb3JjZVN0b3AocGtnKTtcbiAgICBzdGRvdXQgPSAoYXdhaXQgdGhpcy5hZGJFeGVjKGNtZCwge3RpbWVvdXQ6IG9wdGlvbnMudGltZW91dH0pKS50cmltKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byB1bmluc3RhbGwgQVBLLiBPcmlnaW5hbCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gIH1cbiAgbG9nLmRlYnVnKGAnYWRiICR7Y21kLmpvaW4oJyAnKX0nIGNvbW1hbmQgb3V0cHV0OiAke3N0ZG91dH1gKTtcbiAgaWYgKHN0ZG91dC5pbmNsdWRlcygnU3VjY2VzcycpKSB7XG4gICAgbG9nLmluZm8oYCR7cGtnfSB3YXMgc3VjY2Vzc2Z1bGx5IHVuaW5zdGFsbGVkYCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgbG9nLmluZm8oYCR7cGtnfSB3YXMgbm90IHVuaW5zdGFsbGVkYCk7XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbi8qKlxuICogSW5zdGFsbCB0aGUgcGFja2FnZSBhZnRlciBpdCB3YXMgcHVzaGVkIHRvIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYXBrUGF0aE9uRGV2aWNlIC0gVGhlIGZ1bGwgcGF0aCB0byB0aGUgcGFja2FnZSBvbiB0aGUgZGV2aWNlIGZpbGUgc3lzdGVtLlxuICogQHBhcmFtIHtvYmplY3R9IG9wdHMgW3t9XSAtIEFkZGl0aW9uYWwgZXhlYyBvcHRpb25zLiBTZWUge0BsaW5rIGh0dHBzOi8vZ2l0aHViLmNvbS9hcHBpdW0vbm9kZS10ZWVuX3Byb2Nlc3N9XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIG1vcmUgZGV0YWlscyBvbiB0aGlzIHBhcmFtZXRlci5cbiAqIEB0aHJvd3Mge2Vycm9yfSBJZiB0aGVyZSB3YXMgYSBmYWlsdXJlIGR1cmluZyBhcHBsaWNhdGlvbiBpbnN0YWxsLlxuICovXG5hcGtVdGlsc01ldGhvZHMuaW5zdGFsbEZyb21EZXZpY2VQYXRoID0gYXN5bmMgZnVuY3Rpb24gaW5zdGFsbEZyb21EZXZpY2VQYXRoIChhcGtQYXRoT25EZXZpY2UsIG9wdHMgPSB7fSkge1xuICBsZXQgc3Rkb3V0ID0gYXdhaXQgdGhpcy5zaGVsbChbJ3BtJywgJ2luc3RhbGwnLCAnLXInLCBhcGtQYXRoT25EZXZpY2VdLCBvcHRzKTtcbiAgaWYgKHN0ZG91dC5pbmRleE9mKCdGYWlsdXJlJykgIT09IC0xKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBSZW1vdGUgaW5zdGFsbCBmYWlsZWQ6ICR7c3Rkb3V0fWApO1xuICB9XG59O1xuXG4vKipcbiAqIEB0eXBlZGVmIHtPYmplY3R9IENhY2hpbmdPcHRpb25zXG4gKiBAcHJvcGVydHkgez9udW1iZXJ9IHRpbWVvdXQgW2FkYkV4ZWNUaW1lb3V0XSAtIFRoZSBjb3VudCBvZiBtaWxsaXNlY29uZHMgdG8gd2FpdCB1bnRpbCB0aGVcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBwIGlzIHVwbG9hZGVkIHRvIHRoZSByZW1vdGUgbG9jYXRpb24uXG4gKi9cblxuLyoqXG4gKiBDYWNoZXMgdGhlIGdpdmVuIEFQSyBhdCBhIHJlbW90ZSBsb2NhdGlvbiB0byBzcGVlZCB1cCBmdXJ0aGVyIEFQSyBkZXBsb3ltZW50cy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYXBrUGF0aCAtIEZ1bGwgcGF0aCB0byB0aGUgYXBrIG9uIHRoZSBsb2NhbCBGU1xuICogQHBhcmFtIHs/Q2FjaGluZ09wdGlvbnN9IG9wdGlvbnMgLSBDYWNoaW5nIG9wdGlvbnNcbiAqIEByZXR1cm5zIHtzdHJpbmd9IC0gRnVsbCBwYXRoIHRvIHRoZSBjYWNoZWQgYXBrIG9uIHRoZSByZW1vdGUgZmlsZSBzeXN0ZW1cbiAqIEB0aHJvd3Mge0Vycm9yfSBpZiB0aGVyZSB3YXMgYSBmYWlsdXJlIHdoaWxlIGNhY2hpbmcgdGhlIGFwcFxuICovXG5hcGtVdGlsc01ldGhvZHMuY2FjaGVBcGsgPSBhc3luYyBmdW5jdGlvbiBjYWNoZUFwayAoYXBrUGF0aCwgb3B0aW9ucyA9IHt9KSB7XG4gIGNvbnN0IGFwcEhhc2ggPSBhd2FpdCBmcy5oYXNoKGFwa1BhdGgpO1xuICBjb25zdCByZW1vdGVQYXRoID0gcGF0aC5wb3NpeC5qb2luKFJFTU9URV9DQUNIRV9ST09ULCBgJHthcHBIYXNofS5hcGtgKTtcbiAgY29uc3QgcmVtb3RlQ2FjaGVkRmlsZXMgPSBbXTtcbiAgLy8gR2V0IGN1cnJlbnQgY29udGVudHMgb2YgdGhlIHJlbW90ZSBjYWNoZSBvciBjcmVhdGUgaXQgZm9yIHRoZSBmaXJzdCB0aW1lXG4gIHRyeSB7XG4gICAgY29uc3QgZXJyb3JNYXJrZXIgPSAnX0VSUk9SXyc7XG4gICAgbGV0IGxzT3V0cHV0ID0gbnVsbDtcbiAgICBpZiAodGhpcy5fYXJlRXh0ZW5kZWRMc09wdGlvbnNTdXBwb3J0ZWQgPT09IHRydWUgfHwgIV8uaXNCb29sZWFuKHRoaXMuX2FyZUV4dGVuZGVkTHNPcHRpb25zU3VwcG9ydGVkKSkge1xuICAgICAgbHNPdXRwdXQgPSBhd2FpdCB0aGlzLnNoZWxsKFtgbHMgLXQgLTEgJHtSRU1PVEVfQ0FDSEVfUk9PVH0gMj4mMSB8fCBlY2hvICR7ZXJyb3JNYXJrZXJ9YF0pO1xuICAgIH1cbiAgICBpZiAoIV8uaXNTdHJpbmcobHNPdXRwdXQpIHx8IChsc091dHB1dC5pbmNsdWRlcyhlcnJvck1hcmtlcikgJiYgIWxzT3V0cHV0LmluY2x1ZGVzKFJFTU9URV9DQUNIRV9ST09UKSkpIHtcbiAgICAgIGlmICghXy5pc0Jvb2xlYW4odGhpcy5fYXJlRXh0ZW5kZWRMc09wdGlvbnNTdXBwb3J0ZWQpKSB7XG4gICAgICAgIGxvZy5kZWJ1ZygnVGhlIGN1cnJlbnQgQW5kcm9pZCBBUEkgZG9lcyBub3Qgc3VwcG9ydCBleHRlbmRlZCBscyBvcHRpb25zLiAnICtcbiAgICAgICAgICAnRGVmYXVsdGluZyB0byBuby1vcHRpb25zIGNhbGwnKTtcbiAgICAgIH1cbiAgICAgIGxzT3V0cHV0ID0gYXdhaXQgdGhpcy5zaGVsbChbYGxzICR7UkVNT1RFX0NBQ0hFX1JPT1R9IDI+JjEgfHwgZWNobyAke2Vycm9yTWFya2VyfWBdKTtcbiAgICAgIHRoaXMuX2FyZUV4dGVuZGVkTHNPcHRpb25zU3VwcG9ydGVkID0gZmFsc2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX2FyZUV4dGVuZGVkTHNPcHRpb25zU3VwcG9ydGVkID0gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKGxzT3V0cHV0LmluY2x1ZGVzKGVycm9yTWFya2VyKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGxzT3V0cHV0LnN1YnN0cmluZygwLCBsc091dHB1dC5pbmRleE9mKGVycm9yTWFya2VyKSkpO1xuICAgIH1cbiAgICByZW1vdGVDYWNoZWRGaWxlcy5wdXNoKC4uLihcbiAgICAgIGxzT3V0cHV0LnNwbGl0KCdcXG4nKVxuICAgICAgICAubWFwKCh4KSA9PiB4LnRyaW0oKSlcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICkpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgbG9nLmRlYnVnKGBHb3QgYW4gZXJyb3IgJyR7ZS5tZXNzYWdlLnRyaW0oKX0nIHdoaWxlIGdldHRpbmcgdGhlIGxpc3Qgb2YgZmlsZXMgaW4gdGhlIGNhY2hlLiBgICtcbiAgICAgIGBBc3N1bWluZyB0aGUgY2FjaGUgZG9lcyBub3QgZXhpc3QgeWV0YCk7XG4gICAgYXdhaXQgdGhpcy5zaGVsbChbJ21rZGlyJywgJy1wJywgUkVNT1RFX0NBQ0hFX1JPT1RdKTtcbiAgfVxuICBsb2cuZGVidWcoYFRoZSBjb3VudCBvZiBhcHBsaWNhdGlvbnMgaW4gdGhlIGNhY2hlOiAke3JlbW90ZUNhY2hlZEZpbGVzLmxlbmd0aH1gKTtcbiAgY29uc3QgdG9IYXNoID0gKHJlbW90ZVBhdGgpID0+IHBhdGgucG9zaXgucGFyc2UocmVtb3RlUGF0aCkubmFtZTtcbiAgLy8gUHVzaCB0aGUgYXBrIHRvIHRoZSByZW1vdGUgY2FjaGUgaWYgbmVlZGVkXG4gIGlmIChyZW1vdGVDYWNoZWRGaWxlcy5zb21lKCh4KSA9PiB0b0hhc2goeCkgPT09IGFwcEhhc2gpKSB7XG4gICAgbG9nLmluZm8oYFRoZSBhcHBsaWNhdGlvbiBhdCAnJHthcGtQYXRofScgaXMgYWxyZWFkeSBjYWNoZWQgdG8gJyR7cmVtb3RlUGF0aH0nYCk7XG4gICAgLy8gVXBkYXRlIHRoZSBhcHBsaWNhdGlvbiB0aW1lc3RhbXAgYXN5bmNocm9ub3VzbHkgaW4gb3JkZXIgdG8gYnVtcCBpdHMgcG9zaXRpb25cbiAgICAvLyBpbiB0aGUgc29ydGVkIGxzIG91dHB1dFxuICAgIHRoaXMuc2hlbGwoWyd0b3VjaCcsICctYW0nLCByZW1vdGVQYXRoXSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7fSk7XG4gIH0gZWxzZSB7XG4gICAgbG9nLmluZm8oYENhY2hpbmcgdGhlIGFwcGxpY2F0aW9uIGF0ICcke2Fwa1BhdGh9JyB0byAnJHtyZW1vdGVQYXRofSdgKTtcbiAgICBjb25zdCB0aW1lciA9IG5ldyB0aW1pbmcuVGltZXIoKS5zdGFydCgpO1xuICAgIGF3YWl0IHRoaXMucHVzaChhcGtQYXRoLCByZW1vdGVQYXRoLCB7dGltZW91dDogb3B0aW9ucy50aW1lb3V0fSk7XG4gICAgY29uc3Qge3NpemV9ID0gYXdhaXQgZnMuc3RhdChhcGtQYXRoKTtcbiAgICBsb2cuaW5mbyhgVGhlIHVwbG9hZCBvZiAnJHtwYXRoLmJhc2VuYW1lKGFwa1BhdGgpfScgKCR7dXRpbC50b1JlYWRhYmxlU2l6ZVN0cmluZyhzaXplKX0pIGAgK1xuICAgICAgYHRvb2sgJHt0aW1lci5nZXREdXJhdGlvbigpLmFzTWlsbGlTZWNvbmRzLnRvRml4ZWQoMCl9bXNgKTtcbiAgfVxuICBpZiAoIXRoaXMucmVtb3RlQXBwc0NhY2hlKSB7XG4gICAgdGhpcy5yZW1vdGVBcHBzQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogdGhpcy5yZW1vdGVBcHBzQ2FjaGVMaW1pdCxcbiAgICB9KTtcbiAgfVxuICAvLyBDbGVhbnVwIHRoZSBpbnZhbGlkIGVudHJpZXMgZnJvbSB0aGUgY2FjaGVcbiAgXy5kaWZmZXJlbmNlKHRoaXMucmVtb3RlQXBwc0NhY2hlLmtleXMoKSwgcmVtb3RlQ2FjaGVkRmlsZXMubWFwKHRvSGFzaCkpXG4gICAgLmZvckVhY2goKGhhc2gpID0+IHRoaXMucmVtb3RlQXBwc0NhY2hlLmRlbChoYXNoKSk7XG4gIC8vIEJ1bXAgdGhlIGNhY2hlIHJlY29yZCBmb3IgdGhlIHJlY2VudGx5IGNhY2hlZCBpdGVtXG4gIHRoaXMucmVtb3RlQXBwc0NhY2hlLnNldChhcHBIYXNoLCByZW1vdGVQYXRoKTtcbiAgLy8gSWYgdGhlIHJlbW90ZSBjYWNoZSBleGNlZWRzIHRoaXMucmVtb3RlQXBwc0NhY2hlTGltaXQsIHJlbW92ZSB0aGUgbGVhc3QgcmVjZW50bHkgdXNlZCBlbnRyaWVzXG4gIGNvbnN0IGVudHJpZXNUb0NsZWFudXAgPSByZW1vdGVDYWNoZWRGaWxlc1xuICAgIC5tYXAoKHgpID0+IHBhdGgucG9zaXguam9pbihSRU1PVEVfQ0FDSEVfUk9PVCwgeCkpXG4gICAgLmZpbHRlcigoeCkgPT4gIXRoaXMucmVtb3RlQXBwc0NhY2hlLmhhcyh0b0hhc2goeCkpKVxuICAgIC5zbGljZSh0aGlzLnJlbW90ZUFwcHNDYWNoZUxpbWl0IC0gdGhpcy5yZW1vdGVBcHBzQ2FjaGUua2V5cygpLmxlbmd0aCk7XG4gIGlmICghXy5pc0VtcHR5KGVudHJpZXNUb0NsZWFudXApKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuc2hlbGwoWydybScsICctZicsIC4uLmVudHJpZXNUb0NsZWFudXBdKTtcbiAgICAgIGxvZy5kZWJ1ZyhgRGVsZXRlZCAke2VudHJpZXNUb0NsZWFudXAubGVuZ3RofSBleHBpcmVkIGFwcGxpY2F0aW9uIGNhY2hlIGVudHJpZXNgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2cud2FybihgQ2Fubm90IGRlbGV0ZSAke2VudHJpZXNUb0NsZWFudXAubGVuZ3RofSBleHBpcmVkIGFwcGxpY2F0aW9uIGNhY2hlIGVudHJpZXMuIGAgK1xuICAgICAgICBgT3JpZ2luYWwgZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVtb3RlUGF0aDtcbn07XG5cbi8qKlxuICogQHR5cGVkZWYge09iamVjdH0gSW5zdGFsbE9wdGlvbnNcbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSB0aW1lb3V0IFs2MDAwMF0gLSBUaGUgY291bnQgb2YgbWlsbGlzZWNvbmRzIHRvIHdhaXQgdW50aWwgdGhlXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBwIGlzIGluc3RhbGxlZC5cbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSB0aW1lb3V0Q2FwTmFtZSBbYW5kcm9pZEluc3RhbGxUaW1lb3V0XSAtIFRoZSB0aW1lb3V0IG9wdGlvbiBuYW1lXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VycyBjYW4gaW5jcmVhc2UgdGhlIHRpbWVvdXQuXG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IGFsbG93VGVzdFBhY2thZ2VzIFtmYWxzZV0gLSBTZXQgdG8gdHJ1ZSBpbiBvcmRlciB0byBhbGxvdyB0ZXN0XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYWNrYWdlcyBpbnN0YWxsYXRpb24uXG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IHVzZVNkY2FyZCBbZmFsc2VdIC0gU2V0IHRvIHRydWUgdG8gaW5zdGFsbCB0aGUgYXBwIG9uIHNkY2FyZFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3RlYWQgb2YgdGhlIGRldmljZSBtZW1vcnkuXG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IGdyYW50UGVybWlzc2lvbnMgW2ZhbHNlXSAtIFNldCB0byB0cnVlIGluIG9yZGVyIHRvIGdyYW50IGFsbCB0aGVcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVybWlzc2lvbnMgcmVxdWVzdGVkIGluIHRoZSBhcHBsaWNhdGlvbidzIG1hbmlmZXN0XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF1dG9tYXRpY2FsbHkgYWZ0ZXIgdGhlIGluc3RhbGxhdGlvbiBpcyBjb21wbGV0ZWRcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5kZXIgQW5kcm9pZCA2Ky5cbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gcmVwbGFjZSBbdHJ1ZV0gLSBTZXQgaXQgdG8gZmFsc2UgaWYgeW91IGRvbid0IHdhbnRcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGUgYXBwbGljYXRpb24gdG8gYmUgdXBncmFkZWQvcmVpbnN0YWxsZWRcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiBpdCBpcyBhbHJlYWR5IHByZXNlbnQgb24gdGhlIGRldmljZS5cbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gbm9JbmNyZW1lbnRhbCBbZmFsc2VdIC0gRm9yY2VmdWxseSBkaXNhYmxlcyBpbmNyZW1lbnRhbCBpbnN0YWxscyBpZiBzZXQgdG8gYHRydWVgLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBSZWFkIGh0dHBzOi8vZGV2ZWxvcGVyLmFuZHJvaWQuY29tL3ByZXZpZXcvZmVhdHVyZXMjaW5jcmVtZW50YWxcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIG1vcmUgZGV0YWlscy5cbiAqL1xuXG4vKipcbiAqIEluc3RhbGwgdGhlIHBhY2thZ2UgZnJvbSB0aGUgbG9jYWwgZmlsZSBzeXN0ZW0uXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGFwcFBhdGggLSBUaGUgZnVsbCBwYXRoIHRvIHRoZSBsb2NhbCBwYWNrYWdlLlxuICogQHBhcmFtIHs/SW5zdGFsbE9wdGlvbnN9IG9wdGlvbnMgLSBUaGUgc2V0IG9mIGluc3RhbGxhdGlvbiBvcHRpb25zLlxuICogQHRocm93cyB7RXJyb3J9IElmIGFuIHVuZXhwZWN0ZWQgZXJyb3IgaGFwcGVucyBkdXJpbmcgaW5zdGFsbC5cbiAqL1xuYXBrVXRpbHNNZXRob2RzLmluc3RhbGwgPSBhc3luYyBmdW5jdGlvbiBpbnN0YWxsIChhcHBQYXRoLCBvcHRpb25zID0ge30pIHtcbiAgaWYgKGFwcFBhdGguZW5kc1dpdGgoQVBLU19FWFRFTlNJT04pKSB7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuaW5zdGFsbEFwa3MoYXBwUGF0aCwgb3B0aW9ucyk7XG4gIH1cblxuICBvcHRpb25zID0gXy5jbG9uZURlZXAob3B0aW9ucyk7XG4gIF8uZGVmYXVsdHMob3B0aW9ucywge1xuICAgIHJlcGxhY2U6IHRydWUsXG4gICAgdGltZW91dDogdGhpcy5hZGJFeGVjVGltZW91dCA9PT0gREVGQVVMVF9BREJfRVhFQ19USU1FT1VUID8gQVBLX0lOU1RBTExfVElNRU9VVCA6IHRoaXMuYWRiRXhlY1RpbWVvdXQsXG4gICAgdGltZW91dENhcE5hbWU6ICdhbmRyb2lkSW5zdGFsbFRpbWVvdXQnLFxuICB9KTtcblxuICBjb25zdCBpbnN0YWxsQXJncyA9IGJ1aWxkSW5zdGFsbEFyZ3MoYXdhaXQgdGhpcy5nZXRBcGlMZXZlbCgpLCBvcHRpb25zKTtcbiAgaWYgKG9wdGlvbnMubm9JbmNyZW1lbnRhbCAmJiBhd2FpdCB0aGlzLmlzSW5jcmVtZW50YWxJbnN0YWxsU3VwcG9ydGVkKCkpIHtcbiAgICAvLyBBZGIgdGhyb3dzIGFuIGVycm9yIGlmIGl0IGRvZXMgbm90IGtub3cgYWJvdXQgYW4gYXJnLFxuICAgIC8vIHdoaWNoIGlzIHRoZSBjYXNlIGhlcmUgZm9yIG9sZGVyIGFkYiB2ZXJzaW9ucy5cbiAgICBpbnN0YWxsQXJncy5wdXNoKCctLW5vLWluY3JlbWVudGFsJyk7XG4gIH1cbiAgY29uc3QgaW5zdGFsbE9wdHMgPSB7XG4gICAgdGltZW91dDogb3B0aW9ucy50aW1lb3V0LFxuICAgIHRpbWVvdXRDYXBOYW1lOiBvcHRpb25zLnRpbWVvdXRDYXBOYW1lLFxuICB9O1xuICBjb25zdCBpbnN0YWxsQ21kID0gW1xuICAgICdpbnN0YWxsJyxcbiAgICAuLi5pbnN0YWxsQXJncyxcbiAgICBhcHBQYXRoLFxuICBdO1xuICBsZXQgcGVyZm9ybUFwcEluc3RhbGwgPSBhc3luYyAoKSA9PiBhd2FpdCB0aGlzLmFkYkV4ZWMoaW5zdGFsbENtZCwgaW5zdGFsbE9wdHMpO1xuICAvLyB0aGlzLnJlbW90ZUFwcHNDYWNoZUxpbWl0IDw9IDAgbWVhbnMgbm8gY2FjaGluZyBzaG91bGQgYmUgYXBwbGllZFxuICBsZXQgc2hvdWxkQ2FjaGVBcHAgPSB0aGlzLnJlbW90ZUFwcHNDYWNoZUxpbWl0ID4gMDtcbiAgaWYgKHNob3VsZENhY2hlQXBwKSB7XG4gICAgc2hvdWxkQ2FjaGVBcHAgPSAhKGF3YWl0IHRoaXMuaXNTdHJlYW1lZEluc3RhbGxTdXBwb3J0ZWQoKSk7XG4gICAgaWYgKCFzaG91bGRDYWNoZUFwcCkge1xuICAgICAgbG9nLmluZm8oYFRoZSBhcHBsaWNhdGlvbiBhdCAnJHthcHBQYXRofScgd2lsbCBub3QgYmUgY2FjaGVkLCBiZWNhdXNlIHRoZSBkZXZpY2UgdW5kZXIgdGVzdCBoYXMgYCArXG4gICAgICAgIGBjb25maXJtZWQgdGhlIHN1cHBvcnQgb2Ygc3RyZWFtZWQgaW5zdGFsbHNgKTtcbiAgICB9XG4gIH1cbiAgaWYgKHNob3VsZENhY2hlQXBwKSB7XG4gICAgY29uc3QgY2xlYXJDYWNoZSA9IGFzeW5jICgpID0+IHtcbiAgICAgIGxvZy5pbmZvKGBDbGVhcmluZyB0aGUgY2FjaGUgYXQgJyR7UkVNT1RFX0NBQ0hFX1JPT1R9J2ApO1xuICAgICAgYXdhaXQgdGhpcy5zaGVsbChbJ3JtJywgJy1yZicsIGAke1JFTU9URV9DQUNIRV9ST09UfS8qYF0pO1xuICAgIH07XG4gICAgY29uc3QgY2FjaGVBcHAgPSBhc3luYyAoKSA9PiBhd2FpdCB0aGlzLmNhY2hlQXBrKGFwcFBhdGgsIHtcbiAgICAgIHRpbWVvdXQ6IG9wdGlvbnMudGltZW91dCxcbiAgICB9KTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY2FjaGVkQXBwUGF0aCA9IGF3YWl0IGNhY2hlQXBwKCk7XG4gICAgICBwZXJmb3JtQXBwSW5zdGFsbCA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgcG1JbnN0YWxsQ21kQnlSZW1vdGVQYXRoID0gKHJlbW90ZVBhdGgpID0+IFtcbiAgICAgICAgICAncG0nLCAnaW5zdGFsbCcsXG4gICAgICAgICAgLi4uaW5zdGFsbEFyZ3MsXG4gICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgXTtcbiAgICAgICAgY29uc3Qgb3V0cHV0ID0gYXdhaXQgdGhpcy5zaGVsbChwbUluc3RhbGxDbWRCeVJlbW90ZVBhdGgoY2FjaGVkQXBwUGF0aCksIGluc3RhbGxPcHRzKTtcbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FwcGl1bS9hcHBpdW0vaXNzdWVzLzEzOTcwXG4gICAgICAgIGlmICgvXFxiSU5TVEFMTF9GQUlMRURfSU5TVUZGSUNJRU5UX1NUT1JBR0VcXGIvLnRlc3Qob3V0cHV0KSkge1xuICAgICAgICAgIGxvZy53YXJuKGBUaGVyZSB3YXMgYSBmYWlsdXJlIHdoaWxlIGluc3RhbGxpbmcgJyR7YXBwUGF0aH0nIGAgK1xuICAgICAgICAgICAgYGJlY2F1c2Ugb2YgdGhlIGluc3VmZmljaWVudCBkZXZpY2Ugc3RvcmFnZSBzcGFjZWApO1xuICAgICAgICAgIGF3YWl0IGNsZWFyQ2FjaGUoKTtcbiAgICAgICAgICBsb2cuaW5mbyhgQ29uc2lkZXIgZGVjcmVhc2luZyB0aGUgbWF4aW11bSBhbW91bnQgb2YgY2FjaGVkIGFwcHMgYCArXG4gICAgICAgICAgICBgKGN1cnJlbnRseSAke3RoaXMucmVtb3RlQXBwc0NhY2hlTGltaXR9KSB0byBhdm9pZCBzdWNoIGlzc3VlcyBpbiB0aGUgZnV0dXJlYCk7XG4gICAgICAgICAgY29uc3QgbmV3Q2FjaGVkQXBwUGF0aCA9IGF3YWl0IGNhY2hlQXBwKCk7XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2hlbGwocG1JbnN0YWxsQ21kQnlSZW1vdGVQYXRoKG5ld0NhY2hlZEFwcFBhdGgpLCBpbnN0YWxsT3B0cyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dHB1dDtcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nLmRlYnVnKGUpO1xuICAgICAgbG9nLndhcm4oYFRoZXJlIHdhcyBhIGZhaWx1cmUgd2hpbGUgY2FjaGluZyAnJHthcHBQYXRofSc6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgbG9nLndhcm4oJ0ZhbGxpbmcgYmFjayB0byB0aGUgZGVmYXVsdCBpbnN0YWxsYXRpb24gcHJvY2VkdXJlJyk7XG4gICAgICBhd2FpdCBjbGVhckNhY2hlKCk7XG4gICAgfVxuICB9XG4gIHRyeSB7XG4gICAgY29uc3QgdGltZXIgPSBuZXcgdGltaW5nLlRpbWVyKCkuc3RhcnQoKTtcbiAgICBjb25zdCBvdXRwdXQgPSBhd2FpdCBwZXJmb3JtQXBwSW5zdGFsbCgpO1xuICAgIGxvZy5pbmZvKGBUaGUgaW5zdGFsbGF0aW9uIG9mICcke3BhdGguYmFzZW5hbWUoYXBwUGF0aCl9JyB0b29rICR7dGltZXIuZ2V0RHVyYXRpb24oKS5hc01pbGxpU2Vjb25kcy50b0ZpeGVkKDApfW1zYCk7XG4gICAgY29uc3QgdHJ1bmNhdGVkT3V0cHV0ID0gKCFfLmlzU3RyaW5nKG91dHB1dCkgfHwgb3V0cHV0Lmxlbmd0aCA8PSAzMDApID9cbiAgICAgIG91dHB1dCA6IGAke291dHB1dC5zdWJzdHIoMCwgMTUwKX0uLi4ke291dHB1dC5zdWJzdHIob3V0cHV0Lmxlbmd0aCAtIDE1MCl9YDtcbiAgICBsb2cuZGVidWcoYEluc3RhbGwgY29tbWFuZCBzdGRvdXQ6ICR7dHJ1bmNhdGVkT3V0cHV0fWApO1xuICAgIGlmICgvXFxbSU5TVEFMTFtBLVpfXStGQUlMRURbQS1aX10rXFxdLy50ZXN0KG91dHB1dCkpIHtcbiAgICAgIGlmICh0aGlzLmlzVGVzdFBhY2thZ2VPbmx5RXJyb3Iob3V0cHV0KSkge1xuICAgICAgICBjb25zdCBtc2cgPSBgU2V0ICdhbGxvd1Rlc3RQYWNrYWdlcycgY2FwYWJpbGl0eSB0byB0cnVlIGluIG9yZGVyIHRvIGFsbG93IHRlc3QgcGFja2FnZXMgaW5zdGFsbGF0aW9uLmA7XG4gICAgICAgIGxvZy53YXJuKG1zZyk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtvdXRwdXR9XFxuJHttc2d9YCk7XG4gICAgICB9XG4gICAgICB0aHJvdyBuZXcgRXJyb3Iob3V0cHV0KTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIG9uIHNvbWUgc3lzdGVtcyB0aGlzIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgdGhlIGFwcCBhbHJlYWR5XG4gICAgLy8gZXhpc3RzXG4gICAgaWYgKCFlcnIubWVzc2FnZS5pbmNsdWRlcygnSU5TVEFMTF9GQUlMRURfQUxSRUFEWV9FWElTVFMnKSkge1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH1cbiAgICBsb2cuZGVidWcoYEFwcGxpY2F0aW9uICcke2FwcFBhdGh9JyBhbHJlYWR5IGluc3RhbGxlZC4gQ29udGludWluZy5gKTtcbiAgfVxufTtcblxuLyoqXG4gKiBSZXRyaWV2ZXMgdGhlIGN1cnJlbnQgaW5zdGFsbGF0aW9uIHN0YXRlIG9mIHRoZSBwYXJ0aWN1bGFyIGFwcGxpY2F0aW9uXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGFwcFBhdGggLSBGdWxsIHBhdGggdG8gdGhlIGFwcGxpY2F0aW9uXG4gKiBAcGFyYW0gez9zdHJpbmd9IHBrZyAtIFBhY2thZ2UgaWRlbnRpZmllci4gSWYgb21pdHRlZCB0aGVuIHRoZSBzY3JpcHQgd2lsbFxuICogICAgICAgICAgICAgICAgICAgICAgICB0cnkgdG8gZXh0cmFjdCBpdCBvbiBpdHMgb3duXG4gKiBAcmV0dXJucyB7c3RyaW5nfV1PbmUgb2YgYEFQUF9JTlNUQUxMX1NUQVRFYCBjb25zdGFudHNcbiAqL1xuYXBrVXRpbHNNZXRob2RzLmdldEFwcGxpY2F0aW9uSW5zdGFsbFN0YXRlID0gYXN5bmMgZnVuY3Rpb24gZ2V0QXBwbGljYXRpb25JbnN0YWxsU3RhdGUgKGFwcFBhdGgsIHBrZyA9IG51bGwpIHtcbiAgbGV0IGFwa0luZm8gPSBudWxsO1xuICBpZiAoIXBrZykge1xuICAgIGFwa0luZm8gPSBhd2FpdCB0aGlzLmdldEFwa0luZm8oYXBwUGF0aCk7XG4gICAgcGtnID0gYXBrSW5mby5uYW1lO1xuICB9XG4gIGlmICghcGtnKSB7XG4gICAgbG9nLndhcm4oYENhbm5vdCByZWFkIHRoZSBwYWNrYWdlIG5hbWUgb2YgJyR7YXBwUGF0aH0nYCk7XG4gICAgcmV0dXJuIHRoaXMuQVBQX0lOU1RBTExfU1RBVEUuVU5LTk9XTjtcbiAgfVxuXG4gIGlmICghYXdhaXQgdGhpcy5pc0FwcEluc3RhbGxlZChwa2cpKSB7XG4gICAgbG9nLmRlYnVnKGBBcHAgJyR7YXBwUGF0aH0nIGlzIG5vdCBpbnN0YWxsZWRgKTtcbiAgICByZXR1cm4gdGhpcy5BUFBfSU5TVEFMTF9TVEFURS5OT1RfSU5TVEFMTEVEO1xuICB9XG5cbiAgY29uc3Qge3ZlcnNpb25Db2RlOiBwa2dWZXJzaW9uQ29kZSwgdmVyc2lvbk5hbWU6IHBrZ1ZlcnNpb25OYW1lU3RyfSA9IGF3YWl0IHRoaXMuZ2V0UGFja2FnZUluZm8ocGtnKTtcbiAgY29uc3QgcGtnVmVyc2lvbk5hbWUgPSBzZW12ZXIudmFsaWQoc2VtdmVyLmNvZXJjZShwa2dWZXJzaW9uTmFtZVN0cikpO1xuICBpZiAoIWFwa0luZm8pIHtcbiAgICBhcGtJbmZvID0gYXdhaXQgdGhpcy5nZXRBcGtJbmZvKGFwcFBhdGgpO1xuICB9XG4gIGNvbnN0IHt2ZXJzaW9uQ29kZTogYXBrVmVyc2lvbkNvZGUsIHZlcnNpb25OYW1lOiBhcGtWZXJzaW9uTmFtZVN0cn0gPSBhcGtJbmZvO1xuICBjb25zdCBhcGtWZXJzaW9uTmFtZSA9IHNlbXZlci52YWxpZChzZW12ZXIuY29lcmNlKGFwa1ZlcnNpb25OYW1lU3RyKSk7XG5cbiAgaWYgKCFfLmlzSW50ZWdlcihhcGtWZXJzaW9uQ29kZSkgfHwgIV8uaXNJbnRlZ2VyKHBrZ1ZlcnNpb25Db2RlKSkge1xuICAgIGxvZy53YXJuKGBDYW5ub3QgcmVhZCB2ZXJzaW9uIGNvZGVzIG9mICcke2FwcFBhdGh9JyBhbmQvb3IgJyR7cGtnfSdgKTtcbiAgICBpZiAoIV8uaXNTdHJpbmcoYXBrVmVyc2lvbk5hbWUpIHx8ICFfLmlzU3RyaW5nKHBrZ1ZlcnNpb25OYW1lKSkge1xuICAgICAgbG9nLndhcm4oYENhbm5vdCByZWFkIHZlcnNpb24gbmFtZXMgb2YgJyR7YXBwUGF0aH0nIGFuZC9vciAnJHtwa2d9J2ApO1xuICAgICAgcmV0dXJuIHRoaXMuQVBQX0lOU1RBTExfU1RBVEUuVU5LTk9XTjtcbiAgICB9XG4gIH1cbiAgaWYgKF8uaXNJbnRlZ2VyKGFwa1ZlcnNpb25Db2RlKSAmJiBfLmlzSW50ZWdlcihwa2dWZXJzaW9uQ29kZSkpIHtcbiAgICBpZiAocGtnVmVyc2lvbkNvZGUgPiBhcGtWZXJzaW9uQ29kZSkge1xuICAgICAgbG9nLmRlYnVnKGBUaGUgdmVyc2lvbiBjb2RlIG9mIHRoZSBpbnN0YWxsZWQgJyR7cGtnfScgaXMgZ3JlYXRlciB0aGFuIHRoZSBhcHBsaWNhdGlvbiB2ZXJzaW9uIGNvZGUgKCR7cGtnVmVyc2lvbkNvZGV9ID4gJHthcGtWZXJzaW9uQ29kZX0pYCk7XG4gICAgICByZXR1cm4gdGhpcy5BUFBfSU5TVEFMTF9TVEFURS5ORVdFUl9WRVJTSU9OX0lOU1RBTExFRDtcbiAgICB9XG4gICAgLy8gVmVyc2lvbiBjb2RlcyBtaWdodCBub3QgYmUgbWFpbnRhaW5lZC4gQ2hlY2sgdmVyc2lvbiBuYW1lcy5cbiAgICBpZiAocGtnVmVyc2lvbkNvZGUgPT09IGFwa1ZlcnNpb25Db2RlKSB7XG4gICAgICBpZiAoXy5pc1N0cmluZyhhcGtWZXJzaW9uTmFtZSkgJiYgXy5pc1N0cmluZyhwa2dWZXJzaW9uTmFtZSkgJiYgc2VtdmVyLnNhdGlzZmllcyhwa2dWZXJzaW9uTmFtZSwgYD49JHthcGtWZXJzaW9uTmFtZX1gKSkge1xuICAgICAgICBsb2cuZGVidWcoYFRoZSB2ZXJzaW9uIG5hbWUgb2YgdGhlIGluc3RhbGxlZCAnJHtwa2d9JyBpcyBncmVhdGVyIG9yIGVxdWFsIHRvIHRoZSBhcHBsaWNhdGlvbiB2ZXJzaW9uIG5hbWUgKCcke3BrZ1ZlcnNpb25OYW1lfScgPj0gJyR7YXBrVmVyc2lvbk5hbWV9JylgKTtcbiAgICAgICAgcmV0dXJuIHNlbXZlci5zYXRpc2ZpZXMocGtnVmVyc2lvbk5hbWUsIGA+JHthcGtWZXJzaW9uTmFtZX1gKVxuICAgICAgICAgID8gdGhpcy5BUFBfSU5TVEFMTF9TVEFURS5ORVdFUl9WRVJTSU9OX0lOU1RBTExFRFxuICAgICAgICAgIDogdGhpcy5BUFBfSU5TVEFMTF9TVEFURS5TQU1FX1ZFUlNJT05fSU5TVEFMTEVEO1xuICAgICAgfVxuICAgICAgaWYgKCFfLmlzU3RyaW5nKGFwa1ZlcnNpb25OYW1lKSB8fCAhXy5pc1N0cmluZyhwa2dWZXJzaW9uTmFtZSkpIHtcbiAgICAgICAgbG9nLmRlYnVnKGBUaGUgdmVyc2lvbiBuYW1lIG9mIHRoZSBpbnN0YWxsZWQgJyR7cGtnfScgaXMgZXF1YWwgdG8gYXBwbGljYXRpb24gdmVyc2lvbiBuYW1lICgke3BrZ1ZlcnNpb25Db2RlfSA9PT0gJHthcGtWZXJzaW9uQ29kZX0pYCk7XG4gICAgICAgIHJldHVybiB0aGlzLkFQUF9JTlNUQUxMX1NUQVRFLlNBTUVfVkVSU0lPTl9JTlNUQUxMRUQ7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKF8uaXNTdHJpbmcoYXBrVmVyc2lvbk5hbWUpICYmIF8uaXNTdHJpbmcocGtnVmVyc2lvbk5hbWUpICYmIHNlbXZlci5zYXRpc2ZpZXMocGtnVmVyc2lvbk5hbWUsIGA+PSR7YXBrVmVyc2lvbk5hbWV9YCkpIHtcbiAgICBsb2cuZGVidWcoYFRoZSB2ZXJzaW9uIG5hbWUgb2YgdGhlIGluc3RhbGxlZCAnJHtwa2d9JyBpcyBncmVhdGVyIG9yIGVxdWFsIHRvIHRoZSBhcHBsaWNhdGlvbiB2ZXJzaW9uIG5hbWUgKCcke3BrZ1ZlcnNpb25OYW1lfScgPj0gJyR7YXBrVmVyc2lvbk5hbWV9JylgKTtcbiAgICByZXR1cm4gc2VtdmVyLnNhdGlzZmllcyhwa2dWZXJzaW9uTmFtZSwgYD4ke2Fwa1ZlcnNpb25OYW1lfWApXG4gICAgICA/IHRoaXMuQVBQX0lOU1RBTExfU1RBVEUuTkVXRVJfVkVSU0lPTl9JTlNUQUxMRURcbiAgICAgIDogdGhpcy5BUFBfSU5TVEFMTF9TVEFURS5TQU1FX1ZFUlNJT05fSU5TVEFMTEVEO1xuICB9XG5cbiAgbG9nLmRlYnVnKGBUaGUgaW5zdGFsbGVkICcke3BrZ30nIHBhY2thZ2UgaXMgb2xkZXIgdGhhbiAnJHthcHBQYXRofScgKCR7cGtnVmVyc2lvbkNvZGV9IDwgJHthcGtWZXJzaW9uQ29kZX0gb3IgJyR7cGtnVmVyc2lvbk5hbWV9JyA8ICcke2Fwa1ZlcnNpb25OYW1lfScpJ2ApO1xuICByZXR1cm4gdGhpcy5BUFBfSU5TVEFMTF9TVEFURS5PTERFUl9WRVJTSU9OX0lOU1RBTExFRDtcbn07XG5cbi8qKlxuICogQHR5cGVkZWYge09iamVjdH0gSW5zdGFsbE9yVXBncmFkZU9wdGlvbnNcbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSB0aW1lb3V0IFs2MDAwMF0gLSBUaGUgY291bnQgb2YgbWlsbGlzZWNvbmRzIHRvIHdhaXQgdW50aWwgdGhlXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBwIGlzIGluc3RhbGxlZC5cbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gYWxsb3dUZXN0UGFja2FnZXMgW2ZhbHNlXSAtIFNldCB0byB0cnVlIGluIG9yZGVyIHRvIGFsbG93IHRlc3RcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhY2thZ2VzIGluc3RhbGxhdGlvbi5cbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gdXNlU2RjYXJkIFtmYWxzZV0gLSBTZXQgdG8gdHJ1ZSB0byBpbnN0YWxsIHRoZSBhcHAgb24gU0RDYXJkXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGVhZCBvZiB0aGUgZGV2aWNlIG1lbW9yeS5cbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gZ3JhbnRQZXJtaXNzaW9ucyBbZmFsc2VdIC0gU2V0IHRvIHRydWUgaW4gb3JkZXIgdG8gZ3JhbnQgYWxsIHRoZVxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJtaXNzaW9ucyByZXF1ZXN0ZWQgaW4gdGhlIGFwcGxpY2F0aW9uJ3MgbWFuaWZlc3RcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXV0b21hdGljYWxseSBhZnRlciB0aGUgaW5zdGFsbGF0aW9uIGlzIGNvbXBsZXRlZFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmRlciBBbmRyb2lkIDYrLlxuICogQHByb3BlcnR5IHtib29sZWFufSBlbmZvcmNlQ3VycmVudEJ1aWxkIFtmYWxzZV0gLSBTZXQgdG8gYHRydWVgIGluIG9yZGVyIHRvIGFsd2F5cyBwcmVmZXJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIGN1cnJlbnQgYnVpbGQgb3ZlciBhbnkgaW5zdGFsbGVkIHBhY2thZ2VzIGhhdmluZ1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGUgc2FtZSBpZGVudGlmaWVyXG4gKi9cblxuLyoqXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBJbnN0YWxsT3JVcGdyYWRlUmVzdWx0XG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IHdhc1VuaW5zdGFsbGVkIC0gRXF1YWxzIHRvIGB0cnVlYCBpZiB0aGUgdGFyZ2V0IGFwcCBoYXMgYmVlbiB1bmluc3RhbGxlZFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJlZm9yZSBiZWluZyBpbnN0YWxsZWRcbiAqIEBwcm9wZXJ0eSB7QVBQX0lOU1RBTExfU1RBVEV9IGFwcFN0YXRlIC0gT25lIG9mIGBhZGIuQVBQX0lOU1RBTExfU1RBVEVgIHN0YXRlcywgd2hpY2ggcmVmbGVjdHNcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlIHN0YXRlIG9mIHRoZSBhcHBsaWNhdGlvbiBiZWZvcmUgYmVpbmcgaW5zdGFsbGVkLlxuICovXG5cbi8qKlxuICogSW5zdGFsbCB0aGUgcGFja2FnZSBmcm9tIHRoZSBsb2NhbCBmaWxlIHN5c3RlbSBvciB1cGdyYWRlIGl0IGlmIGFuIG9sZGVyXG4gKiB2ZXJzaW9uIG9mIHRoZSBzYW1lIHBhY2thZ2UgaXMgYWxyZWFkeSBpbnN0YWxsZWQuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGFwcFBhdGggLSBUaGUgZnVsbCBwYXRoIHRvIHRoZSBsb2NhbCBwYWNrYWdlLlxuICogQHBhcmFtIHs/c3RyaW5nfSBwa2cgLSBUaGUgbmFtZSBvZiB0aGUgaW5zdGFsbGVkIHBhY2thZ2UuIFRoZSBtZXRob2Qgd2lsbFxuICogICAgICAgICAgICAgICAgICAgICAgICBwZXJmb3JtIGZhc3RlciBpZiBpdCBpcyBzZXQuXG4gKiBAcGFyYW0gez9JbnN0YWxsT3JVcGdyYWRlT3B0aW9uc30gb3B0aW9ucyAtIFNldCBvZiBpbnN0YWxsIG9wdGlvbnMuXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgYW4gdW5leHBlY3RlZCBlcnJvciBoYXBwZW5zIGR1cmluZyBpbnN0YWxsLlxuICogQHJldHVybnMge0luc3RhbGxPclVwZ3JhZGVSZXN1bHR9XG4gKi9cbmFwa1V0aWxzTWV0aG9kcy5pbnN0YWxsT3JVcGdyYWRlID0gYXN5bmMgZnVuY3Rpb24gaW5zdGFsbE9yVXBncmFkZSAoYXBwUGF0aCwgcGtnID0gbnVsbCwgb3B0aW9ucyA9IHt9KSB7XG4gIGlmICghcGtnKSB7XG4gICAgY29uc3QgYXBrSW5mbyA9IGF3YWl0IHRoaXMuZ2V0QXBrSW5mbyhhcHBQYXRoKTtcbiAgICBwa2cgPSBhcGtJbmZvLm5hbWU7XG4gIH1cblxuICBjb25zdCB7XG4gICAgZW5mb3JjZUN1cnJlbnRCdWlsZCxcbiAgfSA9IG9wdGlvbnM7XG4gIGNvbnN0IGFwcFN0YXRlID0gYXdhaXQgdGhpcy5nZXRBcHBsaWNhdGlvbkluc3RhbGxTdGF0ZShhcHBQYXRoLCBwa2cpO1xuICBsZXQgd2FzVW5pbnN0YWxsZWQgPSBmYWxzZTtcbiAgY29uc3QgdW5pbnN0YWxsUGFja2FnZSA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoIWF3YWl0IHRoaXMudW5pbnN0YWxsQXBrKHBrZykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJyR7cGtnfScgcGFja2FnZSBjYW5ub3QgYmUgdW5pbnN0YWxsZWRgKTtcbiAgICB9XG4gICAgd2FzVW5pbnN0YWxsZWQgPSB0cnVlO1xuICB9O1xuICBzd2l0Y2ggKGFwcFN0YXRlKSB7XG4gICAgY2FzZSB0aGlzLkFQUF9JTlNUQUxMX1NUQVRFLk5PVF9JTlNUQUxMRUQ6XG4gICAgICBsb2cuZGVidWcoYEluc3RhbGxpbmcgJyR7YXBwUGF0aH0nYCk7XG4gICAgICBhd2FpdCB0aGlzLmluc3RhbGwoYXBwUGF0aCwgT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge3JlcGxhY2U6IGZhbHNlfSkpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgYXBwU3RhdGUsXG4gICAgICAgIHdhc1VuaW5zdGFsbGVkLFxuICAgICAgfTtcbiAgICBjYXNlIHRoaXMuQVBQX0lOU1RBTExfU1RBVEUuTkVXRVJfVkVSU0lPTl9JTlNUQUxMRUQ6XG4gICAgICBpZiAoZW5mb3JjZUN1cnJlbnRCdWlsZCkge1xuICAgICAgICBsb2cuaW5mbyhgRG93bmdyYWRpbmcgJyR7cGtnfScgYXMgcmVxdWVzdGVkYCk7XG4gICAgICAgIGF3YWl0IHVuaW5zdGFsbFBhY2thZ2UoKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBsb2cuZGVidWcoYFRoZXJlIGlzIG5vIG5lZWQgdG8gZG93bmdyYWRlICcke3BrZ30nYCk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBhcHBTdGF0ZSxcbiAgICAgICAgd2FzVW5pbnN0YWxsZWQsXG4gICAgICB9O1xuICAgIGNhc2UgdGhpcy5BUFBfSU5TVEFMTF9TVEFURS5TQU1FX1ZFUlNJT05fSU5TVEFMTEVEOlxuICAgICAgaWYgKGVuZm9yY2VDdXJyZW50QnVpbGQpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBsb2cuZGVidWcoYFRoZXJlIGlzIG5vIG5lZWQgdG8gaW5zdGFsbC91cGdyYWRlICcke2FwcFBhdGh9J2ApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgYXBwU3RhdGUsXG4gICAgICAgIHdhc1VuaW5zdGFsbGVkLFxuICAgICAgfTtcbiAgICBjYXNlIHRoaXMuQVBQX0lOU1RBTExfU1RBVEUuT0xERVJfVkVSU0lPTl9JTlNUQUxMRUQ6XG4gICAgICBsb2cuZGVidWcoYEV4ZWN1dGluZyB1cGdyYWRlIG9mICcke2FwcFBhdGh9J2ApO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgIGxvZy5kZWJ1ZyhgVGhlIGN1cnJlbnQgaW5zdGFsbCBzdGF0ZSBvZiAnJHthcHBQYXRofScgaXMgdW5rbm93bi4gSW5zdGFsbGluZyBhbnl3YXlgKTtcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCB0aGlzLmluc3RhbGwoYXBwUGF0aCwgT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge3JlcGxhY2U6IHRydWV9KSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGxvZy53YXJuKGBDYW5ub3QgaW5zdGFsbC91cGdyYWRlICcke3BrZ30nIGJlY2F1c2Ugb2YgJyR7ZXJyLm1lc3NhZ2V9Jy4gVHJ5aW5nIGZ1bGwgcmVpbnN0YWxsYCk7XG4gICAgYXdhaXQgdW5pbnN0YWxsUGFja2FnZSgpO1xuICAgIGF3YWl0IHRoaXMuaW5zdGFsbChhcHBQYXRoLCBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7cmVwbGFjZTogZmFsc2V9KSk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBhcHBTdGF0ZSxcbiAgICB3YXNVbmluc3RhbGxlZCxcbiAgfTtcbn07XG5cbi8qKlxuICogRXh0cmFjdCBzdHJpbmcgcmVzb3VyY2VzIGZyb20gdGhlIGdpdmVuIHBhY2thZ2Ugb24gbG9jYWwgZmlsZSBzeXN0ZW0uXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGFwcFBhdGggLSBUaGUgZnVsbCBwYXRoIHRvIHRoZSAuYXBrKHMpIHBhY2thZ2UuXG4gKiBAcGFyYW0gez9zdHJpbmd9IGxhbmd1YWdlIC0gVGhlIG5hbWUgb2YgdGhlIGxhbmd1YWdlIHRvIGV4dHJhY3QgdGhlIHJlc291cmNlcyBmb3IuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgVGhlIGRlZmF1bHQgbGFuZ3VhZ2UgaXMgdXNlZCBpZiB0aGlzIGVxdWFscyB0byBgbnVsbGAvYHVuZGVmaW5lZGBcbiAqIEBwYXJhbSB7c3RyaW5nfSBvdXQgLSBUaGUgbmFtZSBvZiB0aGUgZGVzdGluYXRpb24gZm9sZGVyIG9uIHRoZSBsb2NhbCBmaWxlIHN5c3RlbSB0b1xuICogICAgICAgICAgICAgICAgICAgICAgIHN0b3JlIHRoZSBleHRyYWN0ZWQgZmlsZSB0by5cbiAqIEByZXR1cm4ge09iamVjdH0gQSBtYXBwaW5nIG9iamVjdCwgd2hlcmUgcHJvcGVydGllcyBhcmU6ICdhcGtTdHJpbmdzJywgY29udGFpbmluZ1xuICogICAgICAgICAgICAgICAgICBwYXJzZWQgcmVzb3VyY2UgZmlsZSByZXByZXNlbnRlZCBhcyBKU09OIG9iamVjdCwgYW5kICdsb2NhbFBhdGgnLFxuICogICAgICAgICAgICAgICAgICBjb250YWluaW5nIHRoZSBwYXRoIHRvIHRoZSBleHRyYWN0ZWQgZmlsZSBvbiB0aGUgbG9jYWwgZmlsZSBzeXN0ZW0uXG4gKi9cbmFwa1V0aWxzTWV0aG9kcy5leHRyYWN0U3RyaW5nc0Zyb21BcGsgPSBhc3luYyBmdW5jdGlvbiBleHRyYWN0U3RyaW5nc0Zyb21BcGsgKGFwcFBhdGgsIGxhbmd1YWdlLCBvdXQpIHtcbiAgbG9nLmRlYnVnKGBFeHRyYWN0aW5nIHN0cmluZ3MgZnJvbSBmb3IgbGFuZ3VhZ2U6ICR7bGFuZ3VhZ2UgfHwgJ2RlZmF1bHQnfWApO1xuICBjb25zdCBvcmlnaW5hbEFwcFBhdGggPSBhcHBQYXRoO1xuICBpZiAoYXBwUGF0aC5lbmRzV2l0aChBUEtTX0VYVEVOU0lPTikpIHtcbiAgICBhcHBQYXRoID0gYXdhaXQgdGhpcy5leHRyYWN0TGFuZ3VhZ2VBcGsoYXBwUGF0aCwgbGFuZ3VhZ2UpO1xuICB9XG5cbiAgbGV0IGFwa1N0cmluZ3MgPSB7fTtcbiAgbGV0IGNvbmZpZ01hcmtlcjtcbiAgdHJ5IHtcbiAgICBhd2FpdCB0aGlzLmluaXRBYXB0KCk7XG5cbiAgICBjb25maWdNYXJrZXIgPSBhd2FpdCBmb3JtYXRDb25maWdNYXJrZXIoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qge3N0ZG91dH0gPSBhd2FpdCBleGVjKHRoaXMuYmluYXJpZXMuYWFwdCwgW1xuICAgICAgICAnZCcsICdjb25maWd1cmF0aW9ucycsIGFwcFBhdGgsXG4gICAgICBdKTtcbiAgICAgIHJldHVybiBfLnVuaXEoc3Rkb3V0LnNwbGl0KG9zLkVPTCkpO1xuICAgIH0sIGxhbmd1YWdlLCAnKGRlZmF1bHQpJyk7XG5cbiAgICBjb25zdCB7c3Rkb3V0fSA9IGF3YWl0IGV4ZWModGhpcy5iaW5hcmllcy5hYXB0LCBbXG4gICAgICAnZCcsICctLXZhbHVlcycsICdyZXNvdXJjZXMnLCBhcHBQYXRoLFxuICAgIF0pO1xuICAgIGFwa1N0cmluZ3MgPSBwYXJzZUFhcHRTdHJpbmdzKHN0ZG91dCwgY29uZmlnTWFya2VyKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZy5kZWJ1ZygnQ2Fubm90IGV4dHJhY3QgcmVzb3VyY2VzIHVzaW5nIGFhcHQuIFRyeWluZyBhYXB0Mi4gJyArXG4gICAgICBgT3JpZ2luYWwgZXJyb3I6ICR7ZS5zdGRlcnIgfHwgZS5tZXNzYWdlfWApO1xuXG4gICAgYXdhaXQgdGhpcy5pbml0QWFwdDIoKTtcblxuICAgIGNvbmZpZ01hcmtlciA9IGF3YWl0IGZvcm1hdENvbmZpZ01hcmtlcihhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB7c3Rkb3V0fSA9IGF3YWl0IGV4ZWModGhpcy5iaW5hcmllcy5hYXB0MiwgW1xuICAgICAgICAnZCcsICdjb25maWd1cmF0aW9ucycsIGFwcFBhdGgsXG4gICAgICBdKTtcbiAgICAgIHJldHVybiBfLnVuaXEoc3Rkb3V0LnNwbGl0KG9zLkVPTCkpO1xuICAgIH0sIGxhbmd1YWdlLCAnJyk7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3Qge3N0ZG91dH0gPSBhd2FpdCBleGVjKHRoaXMuYmluYXJpZXMuYWFwdDIsIFtcbiAgICAgICAgJ2QnLCAncmVzb3VyY2VzJywgYXBwUGF0aCxcbiAgICAgIF0pO1xuICAgICAgYXBrU3RyaW5ncyA9IHBhcnNlQWFwdDJTdHJpbmdzKHN0ZG91dCwgY29uZmlnTWFya2VyKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBleHRyYWN0IHJlc291cmNlcyBmcm9tICcke29yaWdpbmFsQXBwUGF0aH0nLiBgICtcbiAgICAgICAgYE9yaWdpbmFsIGVycm9yOiAke2UubWVzc2FnZX1gKTtcbiAgICB9XG4gIH1cblxuICBpZiAoXy5pc0VtcHR5KGFwa1N0cmluZ3MpKSB7XG4gICAgbG9nLndhcm4oYE5vIHN0cmluZ3MgaGF2ZSBiZWVuIGZvdW5kIGluICcke29yaWdpbmFsQXBwUGF0aH0nIHJlc291cmNlcyBgICtcbiAgICAgIGBmb3IgJyR7Y29uZmlnTWFya2VyIHx8ICdkZWZhdWx0J30nIGNvbmZpZ3VyYXRpb25gKTtcbiAgfSBlbHNlIHtcbiAgICBsb2cuaW5mbyhgU3VjY2Vzc2Z1bGx5IGV4dHJhY3RlZCAke18ua2V5cyhhcGtTdHJpbmdzKS5sZW5ndGh9IHN0cmluZ3MgZnJvbSBgICtcbiAgICAgIGAnJHtvcmlnaW5hbEFwcFBhdGh9JyByZXNvdXJjZXMgZm9yICcke2NvbmZpZ01hcmtlciB8fCAnZGVmYXVsdCd9JyBjb25maWd1cmF0aW9uYCk7XG4gIH1cblxuICBjb25zdCBsb2NhbFBhdGggPSBwYXRoLnJlc29sdmUob3V0LCAnc3RyaW5ncy5qc29uJyk7XG4gIGF3YWl0IG1rZGlycChvdXQpO1xuICBhd2FpdCBmcy53cml0ZUZpbGUobG9jYWxQYXRoLCBKU09OLnN0cmluZ2lmeShhcGtTdHJpbmdzLCBudWxsLCAyKSwgJ3V0Zi04Jyk7XG4gIHJldHVybiB7YXBrU3RyaW5ncywgbG9jYWxQYXRofTtcbn07XG5cbi8qKlxuICogR2V0IHRoZSBsYW5ndWFnZSBuYW1lIG9mIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqXG4gKiBAcmV0dXJuIHtzdHJpbmd9IFRoZSBuYW1lIG9mIGRldmljZSBsYW5ndWFnZS5cbiAqL1xuYXBrVXRpbHNNZXRob2RzLmdldERldmljZUxhbmd1YWdlID0gYXN5bmMgZnVuY3Rpb24gZ2V0RGV2aWNlTGFuZ3VhZ2UgKCkge1xuICBsZXQgbGFuZ3VhZ2U7XG4gIGlmIChhd2FpdCB0aGlzLmdldEFwaUxldmVsKCkgPCAyMykge1xuICAgIGxhbmd1YWdlID0gYXdhaXQgdGhpcy5nZXREZXZpY2VTeXNMYW5ndWFnZSgpO1xuICAgIGlmICghbGFuZ3VhZ2UpIHtcbiAgICAgIGxhbmd1YWdlID0gYXdhaXQgdGhpcy5nZXREZXZpY2VQcm9kdWN0TGFuZ3VhZ2UoKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgbGFuZ3VhZ2UgPSAoYXdhaXQgdGhpcy5nZXREZXZpY2VMb2NhbGUoKSkuc3BsaXQoJy0nKVswXTtcbiAgfVxuICByZXR1cm4gbGFuZ3VhZ2U7XG59O1xuXG4vKipcbiAqIEdldCB0aGUgY291bnRyeSBuYW1lIG9mIHRoZSBkZXZpY2UgdW5kZXIgdGVzdC5cbiAqXG4gKiBAcmV0dXJuIHtzdHJpbmd9IFRoZSBuYW1lIG9mIGRldmljZSBjb3VudHJ5LlxuICovXG5hcGtVdGlsc01ldGhvZHMuZ2V0RGV2aWNlQ291bnRyeSA9IGFzeW5jIGZ1bmN0aW9uIGdldERldmljZUNvdW50cnkgKCkge1xuICAvLyB0aGlzIG1ldGhvZCBpcyBvbmx5IHVzZWQgaW4gQVBJIDwgMjNcbiAgbGV0IGNvdW50cnkgPSBhd2FpdCB0aGlzLmdldERldmljZVN5c0NvdW50cnkoKTtcbiAgaWYgKCFjb3VudHJ5KSB7XG4gICAgY291bnRyeSA9IGF3YWl0IHRoaXMuZ2V0RGV2aWNlUHJvZHVjdENvdW50cnkoKTtcbiAgfVxuICByZXR1cm4gY291bnRyeTtcbn07XG5cbi8qKlxuICogR2V0IHRoZSBsb2NhbGUgbmFtZSBvZiB0aGUgZGV2aWNlIHVuZGVyIHRlc3QuXG4gKlxuICogQHJldHVybiB7c3RyaW5nfSBUaGUgbmFtZSBvZiBkZXZpY2UgbG9jYWxlLlxuICovXG5hcGtVdGlsc01ldGhvZHMuZ2V0RGV2aWNlTG9jYWxlID0gYXN5bmMgZnVuY3Rpb24gZ2V0RGV2aWNlTG9jYWxlICgpIHtcbiAgLy8gdGhpcyBtZXRob2QgaXMgb25seSB1c2VkIGluIEFQSSA+PSAyM1xuICBsZXQgbG9jYWxlID0gYXdhaXQgdGhpcy5nZXREZXZpY2VTeXNMb2NhbGUoKTtcbiAgaWYgKCFsb2NhbGUpIHtcbiAgICBsb2NhbGUgPSBhd2FpdCB0aGlzLmdldERldmljZVByb2R1Y3RMb2NhbGUoKTtcbiAgfVxuICByZXR1cm4gbG9jYWxlO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIGxvY2FsZSBuYW1lIG9mIHRoZSBkZXZpY2UgdW5kZXIgdGVzdCBhbmQgdGhlIGZvcm1hdCBvZiB0aGUgbG9jYWxlIGlzIGVuLVVTLCBmb3IgZXhhbXBsZS5cbiAqIFRoaXMgbWV0aG9kIGNhbGwgc2V0RGV2aWNlTGFuZ3VhZ2VDb3VudHJ5LCBzbywgcGxlYXNlIHVzZSBzZXREZXZpY2VMYW5ndWFnZUNvdW50cnkgYXMgcG9zc2libGUuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGxvY2FsZSAtIE5hbWVzIG9mIHRoZSBkZXZpY2UgbGFuZ3VhZ2UgYW5kIHRoZSBjb3VudHJ5IGNvbm5lY3RlZCB3aXRoIGAtYC4gZS5nLiBlbi1VUy5cbiAqL1xuYXBrVXRpbHNNZXRob2RzLnNldERldmljZUxvY2FsZSA9IGFzeW5jIGZ1bmN0aW9uIHNldERldmljZUxvY2FsZSAobG9jYWxlKSB7XG4gIGNvbnN0IHZhbGlkYXRlTG9jYWxlID0gbmV3IFJlZ0V4cCgvW2EtekEtWl0rLVthLXpBLVowLTldKy8pO1xuICBpZiAoIXZhbGlkYXRlTG9jYWxlLnRlc3QobG9jYWxlKSkge1xuICAgIGxvZy53YXJuKGBzZXREZXZpY2VMb2NhbGUgcmVxdWlyZXMgdGhlIGZvbGxvd2luZyBmb3JtYXQ6IGVuLVVTIG9yIGphLUpQYCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGV0IHNwbGl0X2xvY2FsZSA9IGxvY2FsZS5zcGxpdCgnLScpO1xuICBhd2FpdCB0aGlzLnNldERldmljZUxhbmd1YWdlQ291bnRyeShzcGxpdF9sb2NhbGVbMF0sIHNwbGl0X2xvY2FsZVsxXSk7XG59O1xuXG4vKipcbiAqIE1ha2Ugc3VyZSBjdXJyZW50IGRldmljZSBsb2NhbGUgaXMgZXhwZWN0ZWQgb3Igbm90LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBsYW5ndWFnZSAtIExhbmd1YWdlLiBUaGUgbGFuZ3VhZ2UgZmllbGQgaXMgY2FzZSBpbnNlbnNpdGl2ZSwgYnV0IExvY2FsZSBhbHdheXMgY2Fub25pY2FsaXplcyB0byBsb3dlciBjYXNlLlxuICogQHBhcmFtIHtzdHJpbmd9IGNvdW50cnkgLSBDb3VudHJ5LiBUaGUgbGFuZ3VhZ2UgZmllbGQgaXMgY2FzZSBpbnNlbnNpdGl2ZSwgYnV0IExvY2FsZSBhbHdheXMgY2Fub25pY2FsaXplcyB0byBsb3dlciBjYXNlLlxuICogQHBhcmFtIHs/c3RyaW5nfSBzY3JpcHQgLSBTY3JpcHQuIFRoZSBzY3JpcHQgZmllbGQgaXMgY2FzZSBpbnNlbnNpdGl2ZSBidXQgTG9jYWxlIGFsd2F5cyBjYW5vbmljYWxpemVzIHRvIHRpdGxlIGNhc2UuXG4gKlxuICogQHJldHVybiB7Ym9vbGVhbn0gSWYgY3VycmVudCBsb2NhbGUgaXMgbGFuZ3VhZ2UgYW5kIGNvdW50cnkgYXMgYXJndW1lbnRzLCByZXR1cm4gdHJ1ZS5cbiAqL1xuYXBrVXRpbHNNZXRob2RzLmVuc3VyZUN1cnJlbnRMb2NhbGUgPSBhc3luYyBmdW5jdGlvbiBlbnN1cmVDdXJyZW50TG9jYWxlIChsYW5ndWFnZSwgY291bnRyeSwgc2NyaXB0ID0gbnVsbCkge1xuICBjb25zdCBoYXNMYW5ndWFnZSA9IF8uaXNTdHJpbmcobGFuZ3VhZ2UpO1xuICBjb25zdCBoYXNDb3VudHJ5ID0gXy5pc1N0cmluZyhjb3VudHJ5KTtcblxuICBpZiAoIWhhc0xhbmd1YWdlICYmICFoYXNDb3VudHJ5KSB7XG4gICAgbG9nLndhcm4oJ2Vuc3VyZUN1cnJlbnRMb2NhbGUgcmVxdWlyZXMgbGFuZ3VhZ2Ugb3IgY291bnRyeScpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIGdldCBsb3dlciBjYXNlIHZlcnNpb25zIG9mIHRoZSBzdHJpbmdzXG4gIGxhbmd1YWdlID0gKGxhbmd1YWdlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICBjb3VudHJ5ID0gKGNvdW50cnkgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG5cbiAgY29uc3QgYXBpTGV2ZWwgPSBhd2FpdCB0aGlzLmdldEFwaUxldmVsKCk7XG5cbiAgcmV0dXJuIGF3YWl0IHJldHJ5SW50ZXJ2YWwoNSwgMTAwMCwgYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBpZiAoYXBpTGV2ZWwgPCAyMykge1xuICAgICAgICBsZXQgY3VyTGFuZ3VhZ2UsIGN1ckNvdW50cnk7XG4gICAgICAgIGlmIChoYXNMYW5ndWFnZSkge1xuICAgICAgICAgIGN1ckxhbmd1YWdlID0gKGF3YWl0IHRoaXMuZ2V0RGV2aWNlTGFuZ3VhZ2UoKSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBpZiAoIWhhc0NvdW50cnkgJiYgbGFuZ3VhZ2UgPT09IGN1ckxhbmd1YWdlKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGhhc0NvdW50cnkpIHtcbiAgICAgICAgICBjdXJDb3VudHJ5ID0gKGF3YWl0IHRoaXMuZ2V0RGV2aWNlQ291bnRyeSgpKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIGlmICghaGFzTGFuZ3VhZ2UgJiYgY291bnRyeSA9PT0gY3VyQ291bnRyeSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChsYW5ndWFnZSA9PT0gY3VyTGFuZ3VhZ2UgJiYgY291bnRyeSA9PT0gY3VyQ291bnRyeSkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBjdXJMb2NhbGUgPSAoYXdhaXQgdGhpcy5nZXREZXZpY2VMb2NhbGUoKSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgLy8gemgtaGFucy1jbiA6IHpoLWNuXG4gICAgICAgIGNvbnN0IGxvY2FsZUNvZGUgPSBzY3JpcHQgPyBgJHtsYW5ndWFnZX0tJHtzY3JpcHQudG9Mb3dlckNhc2UoKX0tJHtjb3VudHJ5fWAgOiBgJHtsYW5ndWFnZX0tJHtjb3VudHJ5fWA7XG5cbiAgICAgICAgaWYgKGxvY2FsZUNvZGUgPT09IGN1ckxvY2FsZSkge1xuICAgICAgICAgIGxvZy5kZWJ1ZyhgUmVxdWVzdGVkIGxvY2FsZSBpcyBlcXVhbCB0byBjdXJyZW50IGxvY2FsZTogJyR7Y3VyTG9jYWxlfSdgKTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgLy8gaWYgdGhlcmUgaGFzIGJlZW4gYW4gZXJyb3IsIHJlc3RhcnQgYWRiIGFuZCByZXRyeVxuICAgICAgbG9nLmVycm9yKGBVbmFibGUgdG8gY2hlY2sgZGV2aWNlIGxvY2FsaXphdGlvbjogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMucmVjb25uZWN0KCk7XG4gICAgICB9IGNhdGNoIChpZ24pIHtcbiAgICAgICAgYXdhaXQgdGhpcy5yZXN0YXJ0QWRiKCk7XG4gICAgICB9XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9KTtcbn07XG5cbi8qKlxuICogU2V0IHRoZSBsb2NhbGUgbmFtZSBvZiB0aGUgZGV2aWNlIHVuZGVyIHRlc3QuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGxhbmd1YWdlIC0gTGFuZ3VhZ2UuIFRoZSBsYW5ndWFnZSBmaWVsZCBpcyBjYXNlIGluc2Vuc2l0aXZlLCBidXQgTG9jYWxlIGFsd2F5cyBjYW5vbmljYWxpemVzIHRvIGxvd2VyIGNhc2UuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtYXQ6IFthLXpBLVpdezIsOH0uIGUuZy4gZW4sIGphIDogaHR0cHM6Ly9kZXZlbG9wZXIuYW5kcm9pZC5jb20vcmVmZXJlbmNlL2phdmEvdXRpbC9Mb2NhbGUuaHRtbFxuICogQHBhcmFtIHtzdHJpbmd9IGNvdW50cnkgLSBDb3VudHJ5LiBUaGUgY291bnRyeSAocmVnaW9uKSBmaWVsZCBpcyBjYXNlIGluc2Vuc2l0aXZlLCBidXQgTG9jYWxlIGFsd2F5cyBjYW5vbmljYWxpemVzIHRvIHVwcGVyIGNhc2UuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtYXQ6IFthLXpBLVpdezJ9IHwgWzAtOV17M30uIGUuZy4gVVMsIEpQIDogaHR0cHM6Ly9kZXZlbG9wZXIuYW5kcm9pZC5jb20vcmVmZXJlbmNlL2phdmEvdXRpbC9Mb2NhbGUuaHRtbFxuICogQHBhcmFtIHs/c3RyaW5nfSBzY3JpcHQgLSBTY3JpcHQuIFRoZSBzY3JpcHQgZmllbGQgaXMgY2FzZSBpbnNlbnNpdGl2ZSBidXQgTG9jYWxlIGFsd2F5cyBjYW5vbmljYWxpemVzIHRvIHRpdGxlIGNhc2UuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtYXQ6IFthLXpBLVpdezR9LiBlLmcuIEhhbnMgaW4gemgtSGFucy1DTiA6IGh0dHBzOi8vZGV2ZWxvcGVyLmFuZHJvaWQuY29tL3JlZmVyZW5jZS9qYXZhL3V0aWwvTG9jYWxlLmh0bWxcbiAqL1xuYXBrVXRpbHNNZXRob2RzLnNldERldmljZUxhbmd1YWdlQ291bnRyeSA9IGFzeW5jIGZ1bmN0aW9uIHNldERldmljZUxhbmd1YWdlQ291bnRyeSAobGFuZ3VhZ2UsIGNvdW50cnksIHNjcmlwdCA9IG51bGwpIHtcbiAgbGV0IGhhc0xhbmd1YWdlID0gbGFuZ3VhZ2UgJiYgXy5pc1N0cmluZyhsYW5ndWFnZSk7XG4gIGxldCBoYXNDb3VudHJ5ID0gY291bnRyeSAmJiBfLmlzU3RyaW5nKGNvdW50cnkpO1xuICBpZiAoIWhhc0xhbmd1YWdlIHx8ICFoYXNDb3VudHJ5KSB7XG4gICAgbG9nLndhcm4oYHNldERldmljZUxhbmd1YWdlQ291bnRyeSByZXF1aXJlcyBsYW5ndWFnZSBhbmQgY291bnRyeSBhdCBsZWFzdGApO1xuICAgIGxvZy53YXJuKGBHb3QgbGFuZ3VhZ2U6ICcke2xhbmd1YWdlfScgYW5kIGNvdW50cnk6ICcke2NvdW50cnl9J2ApO1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgYXBpTGV2ZWwgPSBhd2FpdCB0aGlzLmdldEFwaUxldmVsKCk7XG5cbiAgbGFuZ3VhZ2UgPSAobGFuZ3VhZ2UgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gIGNvdW50cnkgPSAoY291bnRyeSB8fCAnJykudG9VcHBlckNhc2UoKTtcblxuICBpZiAoYXBpTGV2ZWwgPCAyMykge1xuICAgIGxldCBjdXJMYW5ndWFnZSA9IChhd2FpdCB0aGlzLmdldERldmljZUxhbmd1YWdlKCkpLnRvTG93ZXJDYXNlKCk7XG4gICAgbGV0IGN1ckNvdW50cnkgPSAoYXdhaXQgdGhpcy5nZXREZXZpY2VDb3VudHJ5KCkpLnRvVXBwZXJDYXNlKCk7XG5cbiAgICBpZiAobGFuZ3VhZ2UgIT09IGN1ckxhbmd1YWdlIHx8IGNvdW50cnkgIT09IGN1ckNvdW50cnkpIHtcbiAgICAgIGF3YWl0IHRoaXMuc2V0RGV2aWNlU3lzTG9jYWxlVmlhU2V0dGluZ0FwcChsYW5ndWFnZSwgY291bnRyeSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxldCBjdXJMb2NhbGUgPSBhd2FpdCB0aGlzLmdldERldmljZUxvY2FsZSgpO1xuXG4gICAgLy8gemgtSGFucy1DTiA6IHpoLUNOXG4gICAgY29uc3QgbG9jYWxlQ29kZSA9IHNjcmlwdCA/IGAke2xhbmd1YWdlfS0ke3NjcmlwdH0tJHtjb3VudHJ5fWAgOiBgJHtsYW5ndWFnZX0tJHtjb3VudHJ5fWA7XG4gICAgbG9nLmRlYnVnKGBDdXJyZW50IGxvY2FsZTogJyR7Y3VyTG9jYWxlfSc7IHJlcXVlc3RlZCBsb2NhbGU6ICcke2xvY2FsZUNvZGV9J2ApO1xuICAgIGlmIChsb2NhbGVDb2RlLnRvTG93ZXJDYXNlKCkgIT09IGN1ckxvY2FsZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICBhd2FpdCB0aGlzLnNldERldmljZVN5c0xvY2FsZVZpYVNldHRpbmdBcHAobGFuZ3VhZ2UsIGNvdW50cnksIHNjcmlwdCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIEB0eXBlZGVmIHtPYmplY3R9IEFwcEluZm9cbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBuYW1lIC0gUGFja2FnZSBuYW1lLCBmb3IgZXhhbXBsZSAnY29tLmFjbWUuYXBwJy5cbiAqIEBwcm9wZXJ0eSB7bnVtYmVyfSB2ZXJzaW9uQ29kZSAtIFZlcnNpb24gY29kZS5cbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSB2ZXJzaW9uTmFtZSAtIFZlcnNpb24gbmFtZSwgZm9yIGV4YW1wbGUgJzEuMCcuXG4gKi9cblxuLyoqXG4gKiBHZXQgdGhlIHBhY2thZ2UgaW5mbyBmcm9tIGxvY2FsIGFwayBmaWxlLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBhcHBQYXRoIC0gVGhlIGZ1bGwgcGF0aCB0byBleGlzdGluZyAuYXBrKHMpIHBhY2thZ2Ugb24gdGhlIGxvY2FsXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbGUgc3lzdGVtLlxuICogQHJldHVybiB7P0FwcEluZm99IFRoZSBwYXJzZWQgYXBwbGljYXRpb24gaW5mb3JtYXRpb24uXG4gKi9cbmFwa1V0aWxzTWV0aG9kcy5nZXRBcGtJbmZvID0gYXN5bmMgZnVuY3Rpb24gZ2V0QXBrSW5mbyAoYXBwUGF0aCkge1xuICBpZiAoIWF3YWl0IGZzLmV4aXN0cyhhcHBQYXRoKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgVGhlIGZpbGUgYXQgcGF0aCAke2FwcFBhdGh9IGRvZXMgbm90IGV4aXN0IG9yIGlzIG5vdCBhY2Nlc3NpYmxlYCk7XG4gIH1cblxuICBpZiAoYXBwUGF0aC5lbmRzV2l0aChBUEtTX0VYVEVOU0lPTikpIHtcbiAgICBhcHBQYXRoID0gYXdhaXQgdGhpcy5leHRyYWN0QmFzZUFwayhhcHBQYXRoKTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgY29uc3QgYXBrUmVhZGVyID0gYXdhaXQgQXBrUmVhZGVyLm9wZW4oYXBwUGF0aCk7XG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBhcGtSZWFkZXIucmVhZE1hbmlmZXN0KCk7XG4gICAgY29uc3Qge3BrZywgdmVyc2lvbk5hbWUsIHZlcnNpb25Db2RlfSA9IHBhcnNlTWFuaWZlc3QobWFuaWZlc3QpO1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiBwa2csXG4gICAgICB2ZXJzaW9uQ29kZSxcbiAgICAgIHZlcnNpb25OYW1lLFxuICAgIH07XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBsb2cud2FybihgRXJyb3IgJyR7ZS5tZXNzYWdlfScgd2hpbGUgZ2V0dGluZyBiYWRnaW5nIGluZm9gKTtcbiAgfVxuICByZXR1cm4ge307XG59O1xuXG4vKipcbiAqIEdldCB0aGUgcGFja2FnZSBpbmZvIGZyb20gdGhlIGluc3RhbGxlZCBhcHBsaWNhdGlvbi5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGtnIC0gVGhlIG5hbWUgb2YgdGhlIGluc3RhbGxlZCBwYWNrYWdlLlxuICogQHJldHVybiB7P0FwcEluZm99IFRoZSBwYXJzZWQgYXBwbGljYXRpb24gaW5mb3JtYXRpb24uXG4gKi9cbmFwa1V0aWxzTWV0aG9kcy5nZXRQYWNrYWdlSW5mbyA9IGFzeW5jIGZ1bmN0aW9uIGdldFBhY2thZ2VJbmZvIChwa2cpIHtcbiAgbG9nLmRlYnVnKGBHZXR0aW5nIHBhY2thZ2UgaW5mbyBmb3IgJyR7cGtnfSdgKTtcbiAgbGV0IHJlc3VsdCA9IHtuYW1lOiBwa2d9O1xuICB0cnkge1xuICAgIGNvbnN0IHN0ZG91dCA9IGF3YWl0IHRoaXMuc2hlbGwoWydkdW1wc3lzJywgJ3BhY2thZ2UnLCBwa2ddKTtcbiAgICBjb25zdCB2ZXJzaW9uTmFtZU1hdGNoID0gbmV3IFJlZ0V4cCgvdmVyc2lvbk5hbWU9KFtcXGQrLl0rKS8pLmV4ZWMoc3Rkb3V0KTtcbiAgICBpZiAodmVyc2lvbk5hbWVNYXRjaCkge1xuICAgICAgcmVzdWx0LnZlcnNpb25OYW1lID0gdmVyc2lvbk5hbWVNYXRjaFsxXTtcbiAgICB9XG4gICAgY29uc3QgdmVyc2lvbkNvZGVNYXRjaCA9IG5ldyBSZWdFeHAoL3ZlcnNpb25Db2RlPShcXGQrKS8pLmV4ZWMoc3Rkb3V0KTtcbiAgICBpZiAodmVyc2lvbkNvZGVNYXRjaCkge1xuICAgICAgcmVzdWx0LnZlcnNpb25Db2RlID0gcGFyc2VJbnQodmVyc2lvbkNvZGVNYXRjaFsxXSwgMTApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBsb2cud2FybihgRXJyb3IgJyR7ZXJyLm1lc3NhZ2V9JyB3aGlsZSBkdW1waW5nIHBhY2thZ2UgaW5mb2ApO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5hcGtVdGlsc01ldGhvZHMucHVsbEFwayA9IGFzeW5jIGZ1bmN0aW9uIHB1bGxBcGsgKHBrZywgdG1wRGlyKSB7XG4gIGNvbnN0IHBrZ1BhdGggPSAoYXdhaXQgdGhpcy5hZGJFeGVjKFsnc2hlbGwnLCAncG0nLCAncGF0aCcsIHBrZ10pKS5yZXBsYWNlKCdwYWNrYWdlOicsICcnKTtcbiAgY29uc3QgdG1wQXBwID0gcGF0aC5yZXNvbHZlKHRtcERpciwgYCR7cGtnfS5hcGtgKTtcbiAgYXdhaXQgdGhpcy5wdWxsKHBrZ1BhdGgsIHRtcEFwcCk7XG4gIGxvZy5kZWJ1ZyhgUHVsbGVkIGFwcCBmb3IgcGFja2FnZSAnJHtwa2d9JyB0byAnJHt0bXBBcHB9J2ApO1xuICByZXR1cm4gdG1wQXBwO1xufTtcblxuZXhwb3J0IHsgUkVNT1RFX0NBQ0hFX1JPT1QgfTtcbmV4cG9ydCBkZWZhdWx0IGFwa1V0aWxzTWV0aG9kcztcbiJdLCJmaWxlIjoibGliL3Rvb2xzL2Fway11dGlscy5qcyIsInNvdXJjZVJvb3QiOiIuLi8uLi8uLiJ9
