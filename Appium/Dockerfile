FROM ubuntu:16.04

MAINTAINER Srinivasan Sekar <srinivasan.sekar1990@gmail.com>

WORKDIR /root

ENV DEBIAN_FRONTEND noninteractive \
    DEBCONF_NONINTERACTIVE_SEEN true \

    JAVA_HOME="/usr/lib/jvm/java-8-openjdk-amd64/jre" \
    PATH=$PATH:$JAVA_HOME/bin

#================================================================
# Customize sources for apt-get
#================================================================
RUN echo "deb http://archive.ubuntu.com/ubuntu xenial main universe\n" > /etc/apt/sources.list && \
    echo "deb http://archive.ubuntu.com/ubuntu xenial-updates main universe\n" >> /etc/apt/sources.list && \
    echo "deb http://security.ubuntu.com/ubuntu xenial-security main universe\n" >> /etc/apt/sources.list && \

#================================================================
# Miscellaneous packages
# Includes minimal runtime used for executing non GUI Java programs
#================================================================
    apt-get update -qqy && \
    apt-get -qqy --no-install-recommends install \
    ca-certificates \
    openjdk-8-jre-headless && \
    sed -i 's/securerandom.source=file:\/dev\/urandom/securerandom.source=file:\/dev\/.\/urandom/g' \
       /usr/lib/jvm/java-8-openjdk-amd64/jre/lib/security/java.security && \
    sed -i 's/securerandom.source=file:\/dev\/random/securerandom.source=file:\/dev\/.\/urandom/g' \
       /usr/lib/jvm/java-8-openjdk-amd64/jre/lib/security/java.security && \
    apt-get -qyy autoremove && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

RUN apt-get update -qqy && \
    apt-get -qqy --no-install-recommends install \
    tzdata \
    curl \
    xvfb \
    x11vnc \
    wget \
    libqt5webkit5 \
    unzip && \

#=======================================
# Setting JAVA_HOME in PATH
#=======================================
  { \
		echo '#!/bin/sh'; \
		echo 'set -e'; \
		echo; \
		echo 'dirname "$(dirname "$(readlink -f "$(which javac || which java)")")"'; \
	} > /usr/local/bin/docker-java-home && \
	chmod +x /usr/local/bin/docker-java-home && \
  apt-get -qyy autoremove && \
  rm -rf /var/lib/apt/lists/* /var/cache/apt/*

ENV ANDROID_BUILD_TOOLS_VERSION=25.0.3 \
    ANDROID_HOME=/root

ENV PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/$ANDROID_BUILD_TOOLS_VERSION

#================================================================
# Includes Android SDK
#================================================================
RUN wget -O tools.zip https://dl.google.com/android/repository/tools_r25.2.3-linux.zip && \
    unzip tools.zip && rm tools.zip && \
    echo y | android update sdk -a -u -t platform-tools,build-tools-${ANDROID_BUILD_TOOLS_VERSION} && \
    chmod a+x -R $ANDROID_HOME && \
    chown -R root:root $ANDROID_HOME

ENV APPIUM_VERSION=1.6.5-beta \
    UDEV_REMOTE_FILE=https://raw.githubusercontent.com/M0Rf30/android-udev-rules/master/51-android.rules

RUN curl -sL https://deb.nodesource.com/setup_7.x | bash - && \
    apt-get -qqy install nodejs && \
    npm install -g appium@${APPIUM_VERSION} --no-shrinkwrap  && \
    npm cache clean && \
    apt-get remove --purge -y npm && \
    apt-get autoremove --purge -y && \
    mkdir /etc/udev/rules.d && \
    wget --no-verbose $UDEV_REMOTE_FILE -O /etc/udev/rules.d/51-android.rules && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    apt-get clean

#=======================================
# Expose default port of appium
#=======================================
EXPOSE 4723 5900

CMD appium
