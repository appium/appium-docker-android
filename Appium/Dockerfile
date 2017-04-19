FROM ubuntu:16.04

MAINTAINER Srinivasan Sekar <srinivasan.sekar1990@gmail.com>

#================================================================
# Customize sources for apt-get
#================================================================
RUN  echo "deb http://archive.ubuntu.com/ubuntu xenial main universe\n" > /etc/apt/sources.list && \
     echo "deb http://archive.ubuntu.com/ubuntu xenial-updates main universe\n" >> /etc/apt/sources.list && \
     echo "deb http://security.ubuntu.com/ubuntu xenial-security main universe\n" >> /etc/apt/sources.list && \

#================================================================
# Miscellaneous packages
# Includes minimal runtime used for executing non GUI Java programs
#================================================================
    apt-get update -qqy && \
    apt-get -qqy --no-install-recommends install \
    ca-certificates \
    openjdk-8-jdk-headless \
    xvfb \
    wget \
    unzip && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/* && \
    sed -i 's/securerandom\.source=file:\/dev\/random/securerandom\.source=file:\/dev\/urandom/' ./usr/lib/jvm/java-8-openjdk-amd64/jre/lib/security/java.security && \

#=======================================
# Setting JAVA_HOME in PATH
#=======================================
  { \
		echo '#!/bin/sh'; \
		echo 'set -e'; \
		echo; \
		echo 'dirname "$(dirname "$(readlink -f "$(which javac || which java)")")"'; \
	} > /usr/local/bin/docker-java-home && \
	chmod +x /usr/local/bin/docker-java-home

ENV JAVA_HOME="/usr/lib/jvm/java-8-openjdk-amd64/jre"
ENV PATH $PATH:$JAVA_HOME/bin

ENV DEBIAN_FRONTEND noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN true

ENV ANDROID_SDK_URL="https://dl.google.com/android/repository/tools_r25.2.3-linux.zip" \
    ANDROID_BUILD_TOOLS_VERSION=25.0.2 \
    ANDROID_HOME="/opt/android"

ENV PATH $PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/$ANDROID_BUILD_TOOLS_VERSION

WORKDIR /opt

#================================================================
# Includes Dependencies
#================================================================
RUN dpkg --add-architecture i386 && \
          apt-get -qq update && \
          apt-get -qq install -y curl libncurses5:i386 libstdc++6:i386 zlib1g:i386 qttools5-dev-tools clang qt5-image-formats-plugins libqt5svg5 && \

#================================================================
# Includes Android SDK
#================================================================
    mkdir android && cd android && \
    wget -O tools.zip ${ANDROID_SDK_URL} && \
    unzip tools.zip && rm tools.zip && \
    echo y | android update sdk -a -u -t platform-tools,build-tools-${ANDROID_BUILD_TOOLS_VERSION} && \
    chmod a+x -R $ANDROID_HOME && \
    chown -R root:root $ANDROID_HOME && \
    adb start-server

#===============================================================
# Includes latest node LTS, Appium & Appium Doctor version
#===============================================================
ENV NODEJS_VERSION=7.2.0 \
    PATH=$PATH:/opt/node/bin

WORKDIR "/opt/node"

RUN curl -sL https://nodejs.org/dist/v${NODEJS_VERSION}/node-v${NODEJS_VERSION}-linux-x64.tar.gz | tar xz --strip-components=1 && \
    npm install -g appium@1.6.5-beta --no-shrinkwrap  && \
    npm cache clean && \
    apt-get remove --purge -y npm && \
    apt-get autoremove --purge -y && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    apt-get clean

#============================================
# Add udev rules file with USB configuration
#============================================
ENV UDEV_REMOTE_FILE https://raw.githubusercontent.com/M0Rf30/android-udev-rules/master/51-android.rules
RUN mkdir /etc/udev/rules.d && \
    wget --no-verbose $UDEV_REMOTE_FILE -O /etc/udev/rules.d/51-android.rules

#=======================================
# Expose default port of appium
#=======================================
EXPOSE 4723

VOLUME /Automation

WORKDIR /opt

CMD appium
