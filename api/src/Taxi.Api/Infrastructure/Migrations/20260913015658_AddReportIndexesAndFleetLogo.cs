using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taxi.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddReportIndexesAndFleetLogo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "logo_updated_at",
                table: "fleets",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_orders_fleet_id_driver_id_created_at",
                table: "orders",
                columns: new[] { "fleet_id", "driver_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_orders_fleet_id_status_created_at",
                table: "orders",
                columns: new[] { "fleet_id", "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_order_events_fleet_id_at",
                table: "order_events",
                columns: new[] { "fleet_id", "at" });

            migrationBuilder.CreateIndex(
                name: "ix_audit_logs_fleet_id_at",
                table: "audit_logs",
                columns: new[] { "fleet_id", "at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_orders_fleet_id_driver_id_created_at",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "ix_orders_fleet_id_status_created_at",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "ix_order_events_fleet_id_at",
                table: "order_events");

            migrationBuilder.DropIndex(
                name: "ix_audit_logs_fleet_id_at",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "logo_updated_at",
                table: "fleets");
        }
    }
}
