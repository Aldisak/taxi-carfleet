namespace Taxi.Api.Common;

/// <summary>Stable error code constants used across validators and endpoint logic.
/// Format: "{Domain}.{ErrorName}" — these are used as frontend localization keys and must not change.</summary>
public static class ErrorCodes
{
    /// <summary>Validation error codes returned by FluentValidation validators (HTTP 400).</summary>
    public static class Validation
    {
        /// <summary>The fleet slug is required.</summary>
        public const string FleetSlugRequired = "Validation.FleetSlugRequired";

        /// <summary>The email address is required.</summary>
        public const string EmailRequired = "Validation.EmailRequired";

        /// <summary>The password is required.</summary>
        public const string PasswordRequired = "Validation.PasswordRequired";

        /// <summary>The refresh token is required.</summary>
        public const string RefreshTokenRequired = "Validation.RefreshTokenRequired";

        /// <summary>The phone number is required.</summary>
        public const string PhoneRequired = "Validation.PhoneRequired";

        /// <summary>The phone number is not a valid E.164 or normalizable Czech number.</summary>
        public const string PhoneInvalid = "Validation.PhoneInvalid";

        /// <summary>The SMS verification code is required.</summary>
        public const string CodeRequired = "Validation.CodeRequired";

        /// <summary>The SMS verification code must be exactly 6 digits.</summary>
        public const string CodeInvalid = "Validation.CodeInvalid";

        /// <summary>The pickup address is required.</summary>
        public const string PickupAddressRequired = "Validation.PickupAddressRequired";

        /// <summary>Pickup coordinates (lat + lng) must be provided.</summary>
        public const string PickupCoordsRequired = "Validation.PickupCoordsRequired";

        /// <summary>Dropoff coordinates required when dropoff address is supplied.</summary>
        public const string DropoffCoordsRequired = "Validation.DropoffCoordsRequired";

        /// <summary>Number of passengers must be at least 1.</summary>
        public const string PassengersMinOne = "Validation.PassengersMinOne";

        /// <summary>FixedPriceCzk is required when PriceType is Fixed.</summary>
        public const string FixedPriceCzkRequired = "Validation.FixedPriceCzkRequired";

        /// <summary>FixedPriceCzk must not be set for non-Fixed price types.</summary>
        public const string FixedPriceCzkNotAllowed = "Validation.FixedPriceCzkNotAllowed";

        /// <summary>The scheduledAt timestamp must be in the future.</summary>
        public const string ScheduledAtMustBeFuture = "Validation.ScheduledAtMustBeFuture";

        /// <summary>No fleet resolved for the current request — customer requests require X-Fleet-Slug header.</summary>
        public const string NoTenantResolved = "Validation.NoTenantResolved";

        /// <summary>The customer identity cannot be resolved — the sub claim is missing, unparseable, or the customer User row does not exist.</summary>
        public const string InvalidCustomerIdentity = "Validation.InvalidCustomerIdentity";

        /// <summary>Page must be at least 1.</summary>
        public const string PageMinOne = "Validation.PageMinOne";

        /// <summary>PageSize must be between 1 and 200.</summary>
        public const string PageSizeRange = "Validation.PageSizeRange";

        /// <summary>The reason field is required and must not be empty.</summary>
        public const string ReasonRequired = "Validation.ReasonRequired";

        /// <summary>The final price must be greater than zero.</summary>
        public const string FinalPriceMustBePositive = "Validation.FinalPriceMustBePositive";

        /// <summary>The payment type is required.</summary>
        public const string PaymentTypeRequired = "Validation.PaymentTypeRequired";

        /// <summary>The note text is required and must not be empty.</summary>
        public const string NoteTextRequired = "Validation.NoteTextRequired";

        /// <summary>The note text must not exceed 2000 characters.</summary>
        public const string NoteTextTooLong = "Validation.NoteTextTooLong";

        /// <summary>The vehicle registration plate is required.</summary>
        public const string PlateRequired = "Validation.PlateRequired";

        /// <summary>The vehicle registration plate exceeds the maximum length.</summary>
        public const string PlateTooLong = "Validation.PlateTooLong";

        /// <summary>The number of seats must be at least 1.</summary>
        public const string SeatsMinOne = "Validation.SeatsMinOne";

        /// <summary>The make is required.</summary>
        public const string MakeRequired = "Validation.MakeRequired";

        /// <summary>The model is required.</summary>
        public const string ModelRequired = "Validation.ModelRequired";

        /// <summary>The color is required.</summary>
        public const string ColorRequired = "Validation.ColorRequired";

        /// <summary>The vehicle ID is required.</summary>
        public const string VehicleIdRequired = "Validation.VehicleIdRequired";

        /// <summary>The email address is not a valid format.</summary>
        public const string EmailInvalid = "Validation.EmailInvalid";

        /// <summary>The display name is required.</summary>
        public const string DisplayNameRequired = "Validation.DisplayNameRequired";

        /// <summary>The role is required.</summary>
        public const string RoleRequired = "Validation.RoleRequired";

        /// <summary>The role must be Driver, Dispatcher, or FleetAdmin.</summary>
        public const string RoleNotAllowed = "Validation.RoleNotAllowed";
    }

    /// <summary>Auth-domain error codes (not validation — used for 429 rate-limit responses).</summary>
    public static class Auth
    {
        /// <summary>Too many SMS code requests for this phone number.</summary>
        public const string TooManyRequests = "Auth.TooManyRequests";
    }

    /// <summary>Driver-domain error codes.</summary>
    public static class Driver
    {
        /// <summary>Driver is already online (on shift) — cannot go online again.</summary>
        public const string AlreadyOnline = "Driver.AlreadyOnline";

        /// <summary>Driver is already offline — cannot go offline again.</summary>
        public const string AlreadyOffline = "Driver.AlreadyOffline";

        /// <summary>Driver has an active ride (EnRoute or Busy) — cannot go offline.</summary>
        public const string ActiveRide = "Driver.ActiveRide";
    }

    /// <summary>Vehicle-domain error codes.</summary>
    public static class Vehicle
    {
        /// <summary>A vehicle with the same plate already exists in this fleet.</summary>
        public const string DuplicatePlate = "Vehicle.DuplicatePlate";
    }

    /// <summary>Staff-domain error codes.</summary>
    public static class Staff
    {
        /// <summary>A staff member with the same email already exists in this fleet.</summary>
        public const string DuplicateEmail = "Staff.DuplicateEmail";

        /// <summary>Cannot deactivate yourself — you would lock yourself out of the fleet.</summary>
        public const string SelfDeactivation = "Staff.SelfDeactivation";

        /// <summary>Cannot deactivate an online driver. The driver must go offline first.</summary>
        public const string DriverIsOnline = "Staff.DriverIsOnline";
    }

}
