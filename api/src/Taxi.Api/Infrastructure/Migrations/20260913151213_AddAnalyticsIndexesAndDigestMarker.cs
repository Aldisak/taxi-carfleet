using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taxi.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAnalyticsIndexesAndDigestMarker : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "weekly_digest_markers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    fleet_id = table.Column<Guid>(type: "uuid", nullable: false),
                    iso_year = table.Column<int>(type: "integer", nullable: false),
                    iso_week = table.Column<int>(type: "integer", nullable: false),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_weekly_digest_markers", x => x.id);
                    table.ForeignKey(
                        name: "fk_weekly_digest_markers_fleets_fleet_id",
                        column: x => x.fleet_id,
                        principalTable: "fleets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_orders_fleet_id_completed_at",
                table: "orders",
                columns: new[] { "fleet_id", "completed_at" });

            migrationBuilder.CreateIndex(
                name: "ix_orders_fleet_id_customer_user_id_completed_at",
                table: "orders",
                columns: new[] { "fleet_id", "customer_user_id", "completed_at" });

            migrationBuilder.CreateIndex(
                name: "ix_orders_fleet_id_driver_id_completed_at",
                table: "orders",
                columns: new[] { "fleet_id", "driver_id", "completed_at" });

            migrationBuilder.CreateIndex(
                name: "ix_orders_fleet_id_payment_type_completed_at",
                table: "orders",
                columns: new[] { "fleet_id", "payment_type", "completed_at" });

            migrationBuilder.CreateIndex(
                name: "ix_orders_fleet_id_source_created_at",
                table: "orders",
                columns: new[] { "fleet_id", "source", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_order_events_fleet_id_type_at",
                table: "order_events",
                columns: new[] { "fleet_id", "type", "at" });

            migrationBuilder.CreateIndex(
                name: "ix_driver_shifts_fleet_id_started_at",
                table: "driver_shifts",
                columns: new[] { "fleet_id", "started_at" });

            migrationBuilder.CreateIndex(
                name: "ix_weekly_digest_markers_fleet_id_iso_year_iso_week",
                table: "weekly_digest_markers",
                columns: new[] { "fleet_id", "iso_year", "iso_week" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "weekly_digest_markers");

            migrationBuilder.DropIndex(
                name: "ix_orders_fleet_id_completed_at",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "ix_orders_fleet_id_customer_user_id_completed_at",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "ix_orders_fleet_id_driver_id_completed_at",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "ix_orders_fleet_id_payment_type_completed_at",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "ix_orders_fleet_id_source_created_at",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "ix_order_events_fleet_id_type_at",
                table: "order_events");

            migrationBuilder.DropIndex(
                name: "ix_driver_shifts_fleet_id_started_at",
                table: "driver_shifts");
        }
    }
}
