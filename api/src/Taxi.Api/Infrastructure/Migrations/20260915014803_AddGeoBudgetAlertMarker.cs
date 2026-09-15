using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taxi.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGeoBudgetAlertMarker : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "geo_budget_alert_markers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    fleet_id = table.Column<Guid>(type: "uuid", nullable: false),
                    year = table.Column<int>(type: "integer", nullable: false),
                    month = table.Column<int>(type: "integer", nullable: false),
                    threshold = table.Column<int>(type: "integer", nullable: false),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_geo_budget_alert_markers", x => x.id);
                    table.ForeignKey(
                        name: "fk_geo_budget_alert_markers_fleets_fleet_id",
                        column: x => x.fleet_id,
                        principalTable: "fleets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_geo_budget_alert_markers_fleet_id_year_month_threshold",
                table: "geo_budget_alert_markers",
                columns: new[] { "fleet_id", "year", "month", "threshold" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "geo_budget_alert_markers");
        }
    }
}
