FROM ubuntu:focal-20231211

ENV DEBIAN_FRONTEND=noninteractive

#==================
# General Packages
#------------------
# ca-certificates
#   SSL client
# curl
#   Transfer data from or to a server
# gnupg
#   Encryption software. It is needed for nodejs
# libgconf-2-4
#   Required package for chrome and chromedriver to run on Linux
# libqt5webkit5
#   Web content engine (Fix issue in Android)
# openjdk-11-jdk
#   Java
# sudo
#   Sudo user
# tzdata
#   Timezone
# unzip
#   Unzip zip file
# wget
#   Network downloader
# xvfb
#   X virtual framebuffer
# zip
#   Make a zip file
#==================
RUN apt-get -qqy update && \
    apt dist-upgrade -y && \
    apt-get -qqy --no-install-recommends install \
    ca-certificates \
    curl \
    gnupg \
    libgconf-2-4 \
    libqt5webkit5 \
    openjdk-11-jdk \
    sudo \
    tzdata \
    unzip \
    wget \
    xvfb \
    zip \
  && rm -rf /var/lib/apt/lists/*

#===============
# Set JAVA_HOME
#===============
ENV JAVA_HOME="/usr/lib/jvm/java-11-openjdk-amd64" \
    PATH=$PATH:$JAVA_HOME/bin

#===============================
# Set Timezone (UTC as default)
#===============================
ENV TZ "UTC"
RUN echo "${TZ}" > /etc/timezone \
  && dpkg-reconfigure --frontend noninteractive tzdata

#===============
# Create a user
#===============
ARG USER_PASS=secret
RUN groupadd androidusr \
         --gid 1301 \
  && useradd androidusr \
         --uid 1300 \
         --gid 1301 \
         --create-home \
         --shell /bin/bash \
  && usermod -aG sudo androidusr \
  && echo androidusr:${USER_PASS} | chpasswd \
  && echo 'androidusr ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers

WORKDIR /home/androidusr

#=====================
# Install Android SDK
#=====================
ENV SDK_VERSION=commandlinetools-linux-8512546_latest
ENV ANDROID_BUILD_TOOLS_VERSION=34.0.0
ENV ANDROID_FOLDER_NAME=cmdline-tools
ENV ANDROID_DOWNLOAD_PATH=/home/androidusr/${ANDROID_FOLDER_NAME} \
    ANDROID_HOME=/opt/android \
    ANDROID_TOOL_HOME=/opt/android/${ANDROID_FOLDER_NAME}

RUN wget -O tools.zip https://dl.google.com/android/repository/${SDK_VERSION}.zip && \
    unzip tools.zip && rm tools.zip && \
    chmod a+x -R ${ANDROID_DOWNLOAD_PATH} && \
    chown -R 1300:1301 ${ANDROID_DOWNLOAD_PATH} && \
    mkdir -p ${ANDROID_TOOL_HOME} && \
    mv ${ANDROID_DOWNLOAD_PATH} ${ANDROID_TOOL_HOME}/tools
ENV PATH=$PATH:${ANDROID_TOOL_HOME}/tools:${ANDROID_TOOL_HOME}/tools/bin

# https://askubuntu.com/questions/885658/android-sdk-repositories-cfg-could-not-be-loaded
RUN mkdir -p ~/.android && \
    touch ~/.android/repositories.cfg && \
    echo y | sdkmanager "platform-tools" && \
    echo y | sdkmanager "build-tools;$ANDROID_BUILD_TOOLS_VERSION" && \
    mv ~/.android .android && \
    chown -R 1300:1301 .android
ENV PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools

#====================================
# Install latest nodejs, npm, appium
# Using this workaround to install Appium -> https://github.com/appium/appium/issues/10020 -> Please remove this workaround asap
#====================================
ENV NODE_VERSION=18
ENV APPIUM_VERSION=2.2.2
RUN curl -sL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash && \
    apt-get -qqy install nodejs && \
    npm install -g appium@${APPIUM_VERSION} && \
    exit 0 && \
    npm cache clean && \
    apt-get remove --purge -y npm && \
    apt-get autoremove --purge -y && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    apt-get clean

#====================================================
# Fix permission issue to download e.g. chromedriver
#====================================================
RUN chown -R 1300:1301 /usr/lib/node_modules/appium

#==============
# Copy scripts
#==============
ENV SCRIPT_PATH="appium-docker-android"
RUN mkdir -p ${SCRIPT_PATH}
COPY start.sh \
     generate_selenium_config.sh \
     wireless_autoconnect.sh \
     wireless_connect.sh \
     ${SCRIPT_PATH}/
RUN chown -R 1300:1301 ${SCRIPT_PATH}
ENV APP_PATH=/home/androidusr/${SCRIPT_PATH}

#==================
# Use created user
#==================
USER 1300:1301

#===============================
# Install basic Android drivers
#===============================
ENV APPIUM_DRIVER_ESPRESSO_VERSION="2.29.2"
ENV APPIUM_DRIVER_FLUTTER_VERSION="2.2.2"
ENV APPIUM_DRIVER_GECKO_VERSION="1.2.9"
ENV APPIUM_DRIVER_UIAUTOMATOR2_VERSION="2.34.1"
RUN appium driver install --source=npm appium-espresso-driver@${APPIUM_DRIVER_ESPRESSO_VERSION} && \
    appium driver install --source=npm appium-flutter-driver@${APPIUM_DRIVER_FLUTTER_VERSION} && \
    appium driver install --source=npm appium-geckodriver@${APPIUM_DRIVER_GECKO_VERSION} && \
    appium driver install --source=npm appium-uiautomator2-driver@${APPIUM_DRIVER_UIAUTOMATOR2_VERSION}

#===============
# Expose Port
#---------------
# 4723
#   Appium port
#===============
EXPOSE 4723

#==============
# Start script
#==============
CMD ./${SCRIPT_PATH}/start.sh
