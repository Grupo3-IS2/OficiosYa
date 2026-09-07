# syntax=docker/dockerfile:1

# JDK to compile
ARG JAVA_VERSION=25

# ---------- build ----------
FROM maven:3.9-eclipse-temurin-${JAVA_VERSION} AS build
WORKDIR /build

# Dependencies (changes if pom.xml changes)
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline

# Source code
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests package \
    && cp target/*.jar /build/app.jar

# ---------- runtime ----------
FROM eclipse-temurin:${JAVA_VERSION}-jre AS runtime
WORKDIR /app

# Unprivileged user
RUN useradd --system --uid 1001 --create-home spring

COPY --from=build /build/app.jar /app/app.jar

# keys/ receives JWT keys; data/ only used if APP_PROFILE=local
RUN mkdir -p /app/keys /app/data && chown -R spring:spring /app

USER spring
EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
