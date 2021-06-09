[![Build and Push](https://github.com/appium/appium-docker-android/actions/workflows/release.yml/badge.svg)](https://github.com/appium/appium-docker-android/actions/workflows/release.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/appium/appium.svg?style=flat-square)](https://hub.docker.com/r/appium/appium/)
[![](https://images.microbadger.com/badges/image/appium/appium.svg)](https://microbadger.com/images/appium/appium)
[![star this repo](http://githubbadges.com/star.svg?user=appium&repo=appium-docker-android&style=default)](https://github.com/appium/appium-docker-android)
[![fork this repo](http://githubbadges.com/fork.svg?user=appium&repo=appium-docker-android&style=default)](https://github.com/appium/appium-docker-android/fork)

# Appium Docker for Android

### Why is this approach needed at first place?

- Helps in quick & easier setup of automation environment for Appium + Android
- Without this approach, you'll need to do each of the automation setup steps manually; which can be slow and error prone
- Refer to [Selenium Conference Youtube video](https://www.youtube.com/watch?v=jGW6ycW_tTQ&list=PLRdSclUtJDYXFVU37NEqh4KkT78BLqjcG&index=7) for more details

### Images Included:

- appium/appium - Docker Image to run appium tests on real Android devices.
- To execute in Android emulator's please visit [docker-android](https://github.com/budtmo/docker-android)

### How to Build:

	$ docker build -t "appium/appium:local" -f Appium/Dockerfile Appium

The following `--build-arg`s are available:
- ANDROID_BUILD_TOOLS_VERSION
- ANDROID_PLATFORM_VERSION
- APPIUM_VERSION
- SDK_VERSION

## Setting up Android real device test on Docker macOSX
There are following ways to connecting to a real device
1. [Mount the USB devices connected to Docker host machine](#mount-the-usb-devices-connected-to-docker-host-machine)
2. [Connect Each Device to a Separate Container](#connect-each-device-to-a-separate-container)
3. [Connect to Android devices by Air](#connect-to-android-devices-by-air)
4. [Connect to an ADB server](#connect-to-an-adb-server)
5. [Connect to Selenium Grid](#connect-to-selenium-grid)

## Mount the USB devices connected to Docker host machine

1. Make sure you have latest docker installed on mac.

	```
	$ docker-machine --version
	$ docker-machine version 0.10.0, build 76ed2a6
	```

2. Create a docker-machine as follows

	```
	$ docker-machine create --driver virtualbox appium-test-machine
	```

3. Enable USB in created docker-machine

	```
	$ docker-machine stop appium-test-machine
	$ vboxmanage modifyvm appium-test-machine --usb on --usbehci on
	$ docker-machine start appium-test-machine
	```
	***Note:***
	You need to install [Extension Pack](https://www.virtualbox.org/wiki/Download_Old_Builds_5_1) depends on your virtualbox version, in case you get an Error "Implementation of the USB 2.0 controller not found"

4. Open Virtual box, move to appium-test-machine created, select USB and add Android device and Host Controller.

	![alt tag](images/virtualbox.png)

5. Remove your base machine's ownership over the Android device(s)

	```
	adb kill-server
	```

6. SSH into the docker machine created

	```
	$ docker-machine ssh appium-test-machine
	```

7. Run the docker image on the newly created docker machine

	```
	$ docker run --privileged -d -p 4723:4723  -v /dev/bus/usb:/dev/bus/usb --name container-appium appium/appium
	```

8. Run following command to verify adb devices can detect the connected android device.

	```
	$ docker exec -it container-appium adb devices
	```

9. Run UI Test with following test configuration

	```
	Push the apk file into the container
	$ docker cp /Users/loacl-macosx-path-to-apk/app-debug.apk container-appium:/opt

	Desired Capabilities:

	private void androidSetup() throws MalformedURLException {
	        caps.setCapability("deviceName", "Android");
	        caps.setCapability("app", "/opt/app-debug.apk");
	        //Get the IP Address of boot2docker
	        //docker inspect $(docker ps -q) | grep IPA
	        driver = new AndroidDriver<MobileElement>(new URL("http://192.168.99.100:32769/wd/hub"), caps);
	}
	```

### Share Android identification key

Each time, you will (re)create container, connected to container devices will ask for authorization after first
 connection.  To prevent that, you can share one identity through all created containers. To do that, you should:

- Connect all devices to docker physical machine
- Run `adb devices`
- Authorize all devices (do not forget to check **Always allow this computer**)

![Always allow this computer screenshot](images/authorization.png)

- run your containers with parameter `-v ~/.android:/root/.android`

For example:
```
$ docker run --privileged -d -p 4723:4723 -v ~/.android:/root/.android -v /dev/bus/usb:/dev/bus/usb --name container-appium appium/appium
```

## Connect Each Device to a Separate Container

In certain use cases you may want to have a single Appium-Docker-Android container running for each device. To achieve this you must run `adb kill-server` and then provide the `--device` option to `docker run`:

```
$ docker run -d -p 4723:4723 --device /dev/bus/usb/XXX/YYY:/dev/bus/usb/XXX/YYY -v ~/.android:/root/.android --name device1 appium/appium
$ docker run -d -p 4724:4723 --device /dev/bus/usb/XXX/ZZZ:/dev/bus/usb/XXX/ZZZ -v ~/.android:/root/.android --name device2 appium/appium
```

## Connect to Android devices by Air

Appium-Docker-Android can be connected with Android devices by Air.

To do that you need to configure android device, according to [official manual](https://developer.android.com/studio/command-line/adb.html#wireless)

Then run docker container with following parameters:

- REMOTE\_ADB=true
- ANDROID\_DEVICES=\<android\_device\_host\>:\<android\_device\_port\> \[,\<android\_device\_host\>:\<android\_device\_port\>\]
- REMOTE_ADB_POLLING_SEC=60 (default: 5, interval between polling the list of connected devices in order to connect to lost remote devices)

```
$ docker run -d -p 4723:4723 -e REMOTE_ADB=true -e ANDROID_DEVICES=192.168.0.5:5555,192.168.0.6:5555 -e REMOTE_ADB_POLLING_SEC=60
```

## Connect to an ADB server

1. Make sure you have latest docker installed on mac.

	```
	$ docker-machine --version
	$ docker-machine version 0.10.0, build 76ed2a6
	```

2. Setup ADB on the machine where you wish to connect the devices. This machine could be anywhere as long as they are accessible from your organization's internal network or internet. E.g. A Raspberry Pi having a real device connected or an AWS machine acting as an emulator farm.

2. Start the ADB in server with the following command on the machine where the real device is connected
    ```
    $ adb kill-server # to make sure there is only one adb server running
    $ adb -a -P <any_available_port> nodaemon server >/tmp/adb_server_log 2>&1 &

    # If you want to start the server at default port remove the -P and port number
    # and the server will start at port 5037
    ```

3. Get the IP of the machine and make sure that it's accessible over the network.
    
    ```
    $ ifconfig | grep "inet " | grep -Fv 127.0.0.1 | awk '{print $2}'
    ```

4. Start the appium docker container with the following command

    ```
    $ docker run -p 4723:4723 -e "ADB_SERVER_SOCKET=tcp:<device_host_ip>:<adb_server_port>" --name container-appium appium/appium

    # e.g. $ docker run -d -p 4723:4723 -e "ADB_SERVER_SOCKET=tcp:<host_ip>:5037" --name container-appium appium/appium
    ```

 5. You should be able to see all connected Android real device and emulators when you run following command
    ```
    $ docker exec -it container-appium adb devices
    ```

## Connect to Selenium Grid

Appium-Docker-Android can be connected with selenium grid by passing following parameters:

- CONNECT\_TO\_GRID=true
- APPIUM\_HOST=\<ip\_address\_of\_appium\_server>
- APPIUM\_PORT=\<port\_of\_appium\_server>
- SELENIUM\_HOST=\<ip\_address\_of\_selenium\_hub>
- SELENIUM\_PORT=\<port\_of\_selenium\_hub>

```
$ docker run --privileged -d -p 4723:4723 -e CONNECT_TO_GRID=true -e APPIUM_HOST="127.0.0.1" -e APPIUM_PORT=4723 -e SELENIUM_HOST="172.17.0.1" -e SELENIUM_PORT=4444 -v /dev/bus/usb:/dev/bus/usb --name container-appium appium/appium
```

### Custom Node Config

The image generates the node config file, if you would like to provide your own config pass the following parameters:

- CONNECT\_TO\_GRID=true
- CUSTOM\_NODE\_CONFIG=true
- -v \<path\_to\_config>:/root/nodeconfig.json

### Relaxed Security

Pass environment variable RELAXED_SECURITY=true to disable additional security check to use some advanced features.

### Enable Appium Test Distribution

You can enable [ATD](https://github.com/AppiumTestDistribution/AppiumTestDistribution) by passing environment variable ATD=true and bind the port to the host, e.g. -p 4567:4567

### Enable SaltStack

You can enable [SaltStack](https://github.com/saltstack/salt) to control running containers by passing environment variable SALT_MASTER=<ip_address_of_salt_master>.

### Docker compose

There is [an example of compose file](examples/docker-compose.yml) to simulate the connection between selenium hub and appium server with connected device(s) in docker solution.

```
$ docker-compose up -d
```