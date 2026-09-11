FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["api/src/Taxi.Api/Taxi.Api.csproj", "api/src/Taxi.Api/"]
RUN dotnet restore "api/src/Taxi.Api/Taxi.Api.csproj"
COPY api/src/Taxi.Api/ api/src/Taxi.Api/
WORKDIR /src/api/src/Taxi.Api
RUN dotnet build "Taxi.Api.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Taxi.Api.csproj" -c Release -o /app/publish --no-restore

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "Taxi.Api.dll"]
