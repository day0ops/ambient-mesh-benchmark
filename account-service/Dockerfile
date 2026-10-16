# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY account-service/pom.xml account-service/pom.xml
COPY ledger-service/pom.xml ledger-service/pom.xml
RUN mvn -B -ntp -pl account-service -am dependency:go-offline
COPY account-service account-service
COPY ledger-service ledger-service
RUN mvn -B -ntp -pl account-service -am package -Dmaven.test.skip=true

FROM eclipse-temurin:21-jre AS otel
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.9.0/opentelemetry-javaagent.jar /otel/opentelemetry-javaagent.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/account-service/target/account-service.jar app.jar
COPY --from=otel /otel/opentelemetry-javaagent.jar otel-javaagent.jar
ENV JAVA_TOOL_OPTIONS="-javaagent:/app/otel-javaagent.jar" \
    OTEL_SERVICE_NAME="account-service" \
    OTEL_TRACES_EXPORTER="otlp" \
    OTEL_METRICS_EXPORTER="none" \
    OTEL_LOGS_EXPORTER="none"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
