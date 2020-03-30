#!/bin/bash

CMD="npm install -g appium@$APPIUM_VERSION --unsafe-perm=true --allow-root --no-shrinkwrap"

chrome_version="$(adb shell dumpsys package com.android.chrome | grep versionName -m1 | cut -f 2 -d '=')"

version_array=($(echo $chrome_version | tr '.' "\n"))
major_version=${version_array[0]}

case $major_version in
  "80")
    export CHROMEDRIVER_VERSION="80.0.3987.106"
    ;;

  "79")
    export CHROMEDRIVER_VERSION="79.0.3945.36"
    ;;

  "78")
    export CHROMEDRIVER_VERSION="78.0.3904.70"
    ;;

  "77")
    export CHROMEDRIVER_VERSION="77.0.3865.40"
    ;;

  *)
    export CHROMEDRIVER_VERSION="80.0.3987.106"
    ;;
esac

$CMD


