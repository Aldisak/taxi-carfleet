using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taxi.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMapyGeoSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "distance_m",
                table: "orders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "duration_s",
                table: "orders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "geo_monthly_credit_budget",
                table: "fleet_settings",
                type: "integer",
                nullable: false,
                defaultValue: 250000);

            migrationBuilder.AddColumn<double>(
                name: "map_center_lat",
                table: "fleet_settings",
                type: "double precision",
                nullable: false,
                defaultValue: 50.079999999999998);

            migrationBuilder.AddColumn<double>(
                name: "map_center_lng",
                table: "fleet_settings",
                type: "double precision",
                nullable: false,
                defaultValue: 14.42);

            migrationBuilder.AddColumn<int>(
                name: "map_zoom",
                table: "fleet_settings",
                type: "integer",
                nullable: false,
                defaultValue: 12);

            migrationBuilder.AddColumn<string>(
                name: "mapy_browser_key",
                table: "fleet_settings",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "mapy_server_key",
                table: "fleet_settings",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "geo_cache",
                columns: table => new
                {
                    fleet_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    key = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    value = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_geo_cache", x => new { x.fleet_id, x.kind, x.key });
                    table.ForeignKey(
                        name: "fk_geo_cache_fleets_fleet_id",
                        column: x => x.fleet_id,
                        principalTable: "fleets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "geo_usage",
                columns: table => new
                {
                    fleet_id = table.Column<Guid>(type: "uuid", nullable: false),
                    day = table.Column<DateOnly>(type: "date", nullable: false),
                    kind = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    calls = table.Column<int>(type: "integer", nullable: false),
                    credits_est = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_geo_usage", x => new { x.fleet_id, x.day, x.kind });
                    table.ForeignKey(
                        name: "fk_geo_usage_fleets_fleet_id",
                        column: x => x.fleet_id,
                        principalTable: "fleets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_geo_cache_created_at",
                table: "geo_cache",
                column: "created_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "geo_cache");

            migrationBuilder.DropTable(
                name: "geo_usage");

            migrationBuilder.DropColumn(
                name: "distance_m",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "duration_s",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "geo_monthly_credit_budget",
                table: "fleet_settings");

            migrationBuilder.DropColumn(
                name: "map_center_lat",
                table: "fleet_settings");

            migrationBuilder.DropColumn(
                name: "map_center_lng",
                table: "fleet_settings");

            migrationBuilder.DropColumn(
                name: "map_zoom",
                table: "fleet_settings");

            migrationBuilder.DropColumn(
                name: "mapy_browser_key",
                table: "fleet_settings");

            migrationBuilder.DropColumn(
                name: "mapy_server_key",
                table: "fleet_settings");
        }
    }
}
