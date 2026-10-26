#!/usr/bin/env bats

load ../../node_modules/bats-mock/stub

@test '[Appium] Verify APPIUM_PLUGINS installs and enables plugins' {
  stub appium \
    "plugin install images : echo 'Installed images'" \
    "plugin install execute-driver@4.0.0 : echo 'Installed execute-driver'"
  stub pkill \
    "-x xvfb-run : true"
  stub xvfb-run \
    "appium --log /var/log/appium.log --use-plugins images,execute-driver : echo 'Started Appium with plugins'"

  APPIUM_PLUGINS="images, execute-driver@4.0.0" run ${APP_PATH}/start.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"Installing Appium plugin: images"* ]]
  [[ "$output" == *"Installing Appium plugin: execute-driver@4.0.0"* ]]
  [[ "$output" == *"Started Appium with plugins"* ]]

  unstub appium
  unstub pkill
  unstub xvfb-run
}

@test '[Wireless] Verify wireless_connect skips already connected devices' {
  stub adb \
    "devices : printf 'List of devices attached\n192.168.0.5:5555\tdevice\n'" \
    "connect 192.168.0.6:5555 : echo 'connected to 192.168.0.6:5555'" \
    "devices : printf 'List of devices attached\n192.168.0.5:5555\tdevice\n192.168.0.6:5555\tdevice\n'"
  stub sleep \
    "2 : true"

  ANDROID_DEVICES="192.168.0.5:5555, 192.168.0.6:5555" run ${APP_PATH}/wireless_connect.sh
  [ "$status" -eq 0 ]
  [[ "$output" != *"Connecting to: 192.168.0.5:5555"* ]]
  [[ "$output" == *"Connecting to: 192.168.0.6:5555"* ]]

  unstub adb
  unstub sleep
}
