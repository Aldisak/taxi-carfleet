using System.Globalization;
using System.Text;
using Taxi.Api.Features.Reports.GetDriverReport;

namespace Taxi.Api.Common.Reports;

/// <summary>Pure CSV writer for the driver report. Produces a UTF-8 byte array WITH a BOM (EF BB BF),
/// ';' field separator, and CRLF line endings — the format Czech Excel opens correctly. No FastEndpoints
/// dependency, no CsvHelper: the byte layout is stable and byte-compared in tests (AC#7).</summary>
internal static class DriverReportCsv
{
    private static readonly byte[] Bom = [0xEF, 0xBB, 0xBF];

    private const string Separator = ";";
    private const string NewLine = "\r\n";

    /// <summary>Serializes a driver report into CSV bytes (BOM + ';' + CRLF). Numbers use invariant
    /// formatting; hours-online uses a dot decimal to two places.</summary>
    /// <param name="report">The driver report to serialize.</param>
    /// <returns>The encoded CSV bytes, starting with the UTF-8 BOM.</returns>
    public static byte[] Write(GetDriverReportResponse report)
    {
        var sb = new StringBuilder();

        // Header (Czech — Czech Excel audience).
        AppendRow(sb,
            "Datum", "Dokončené", "Zrušené", "Hotovost", "Karta",
            "Faktura", "Celkem", "Hodiny online", "Úpravy ceny");

        foreach (var day in report.Days)
        {
            AppendRow(sb,
                day.Date,
                Int(day.RidesCompleted),
                Int(day.RidesCancelled),
                Int(day.CashCzk),
                Int(day.CardCzk),
                Int(day.InvoiceCzk),
                Int(day.TotalCzk),
                Hours(day.HoursOnline),
                Int(day.PriceOverrideCount));
        }

        // Totals row, labelled "Celkem".
        var t = report.Totals;
        AppendRow(sb,
            "Celkem",
            Int(t.RidesCompleted),
            Int(t.RidesCancelled),
            Int(t.CashCzk),
            Int(t.CardCzk),
            Int(t.InvoiceCzk),
            Int(t.TotalCzk),
            Hours(t.HoursOnline),
            Int(t.PriceOverrideCount));

        var body = Encoding.UTF8.GetBytes(sb.ToString());
        var result = new byte[Bom.Length + body.Length];
        Bom.CopyTo(result, 0);
        body.CopyTo(result, Bom.Length);
        return result;
    }

    private static void AppendRow(StringBuilder sb, params string[] fields)
    {
        sb.Append(string.Join(Separator, fields.Select(Escape)));
        sb.Append(NewLine);
    }

    /// <summary>Escapes a CSV field: wraps in double quotes and doubles embedded quotes when the value
    /// contains the separator, a quote, or a newline.</summary>
    private static string Escape(string value)
    {
        if (value.Contains(Separator, StringComparison.Ordinal)
            || value.Contains('"')
            || value.Contains('\n')
            || value.Contains('\r'))
        {
            return "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
        }

        return value;
    }

    private static string Int(int value) => value.ToString(CultureInfo.InvariantCulture);

    private static string Hours(double value) => value.ToString("0.##", CultureInfo.InvariantCulture);
}
