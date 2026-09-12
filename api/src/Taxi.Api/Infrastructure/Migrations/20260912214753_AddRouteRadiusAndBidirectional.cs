using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taxi.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRouteRadiusAndBidirectional : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "from_radius_meters",
                table: "routes",
                type: "double precision",
                nullable: false,
                defaultValue: 150.0);

            migrationBuilder.AddColumn<bool>(
                name: "is_bidirectional",
                table: "routes",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<double>(
                name: "to_radius_meters",
                table: "routes",
                type: "double precision",
                nullable: false,
                defaultValue: 150.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "from_radius_meters",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "is_bidirectional",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "to_radius_meters",
                table: "routes");
        }
    }
}
