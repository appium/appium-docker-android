#!/usr/bin/env bats

load ../node_modules/bats-mock/stub

default_node_config=\
'{
  "capabilities": [{
    "platform": "Android",
    "platformName": "Android",
    "version": "7.1.1",
    "browserName": "android",
    "deviceName": "73QDU16916010699",
    "maxInstances": 1,
    "applicationName": "73QDU16916010699"
  }, {
    "platform": "Android",
    "platformName": "Android",
    "version": "5.1.1",
    "browserName": "android",
    "deviceName": "4b13354b80b36200",
    "maxInstances": 1,
    "applicationName": "4b13354b80b36200"
  }],
  "configuration": {
    "cleanUpCycle": 2000,
    "timeout": 300,
    "proxy": "org.openqa.grid.selenium.proxy.DefaultRemoteProxy",
    "url": "http://127.0.0.1:4723/wd/hub",
    "host": "127.0.0.1",
    "port": 4723,
    "maxSession": 6,
    "register": true,
    "registerCycle": 5000,
    "hubHost": "172.17.0.1",
    "hubPort": 4444
  }
}'
node_config_json="/root/nodeconfig.json"
adb_devices_output='73QDU16916010699 device 4b13354b80b36200 device'

@test 'Verify selenium grid config is created' {
  stub adb \
    "devices : echo $adb_devices_output" \
    "-s 73QDU16916010699 shell getprop ro.build.version.release : echo 7.1.1" \
    "-s 73QDU16916010699 shell getprop ro.serialno : echo 73QDU16916010699" \
    "-s 4b13354b80b36200 shell getprop ro.build.version.release : echo 5.1.1" \
    "-s 4b13354b80b36200 shell getprop ro.serialno : echo 4b13354b80b36200"

  run /root/generate_config.sh $node_config_json
  [ "$(cat $node_config_json)" == "$default_node_config" ]

  unstub adb
}
