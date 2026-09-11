using FluentAssertions;
using Taxi.Api.Common.Orders;
using Taxi.Api.Infrastructure.Entities;

namespace Taxi.Api.Tests.Orders.StateMachine;

/// <summary>Pure unit tests for <see cref="OrderStateMachine"/> — no database, no I/O.
/// Tests run without a collection fixture (no container needed).</summary>
public class OrderStateMachineTests
{
    // ── Factories ─────────────────────────────────────────────────────────────

    private static Order NewOrder(OrderStatus status = OrderStatus.New) => new()
    {
        Id = Guid.CreateVersion7(),
        FleetId = Guid.CreateVersion7(),
        PublicCode = "TEST01",
        Status = status,
        CustomerPhone = "+420600000001",
        PickupAddress = "Test pickup",
        Source = OrderSource.Dispatcher,
        PriceType = PriceType.Estimate,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
        Version = 1
    };

    private static readonly Guid _dispatcherId = Guid.CreateVersion7();
    private static readonly Guid _driverId = Guid.CreateVersion7();
    private static readonly Guid _driverRowId = Guid.CreateVersion7();
    private static readonly Guid _vehicleId = Guid.CreateVersion7();
    private static readonly Guid _customerId = Guid.CreateVersion7();

    private static Actor DispatcherActor() => new(_dispatcherId, UserRole.Dispatcher);
    private static Actor FleetAdminActor() => new(_dispatcherId, UserRole.FleetAdmin);
    private static Actor AssignedDriverActor() => new(_driverId, UserRole.Driver, _driverRowId);
    private static Actor CustomerActor(Guid? userId = null) => new(userId ?? _customerId, UserRole.Customer);

    private static DateTimeOffset Now => new(2026, 9, 10, 12, 0, 0, TimeSpan.Zero);

    // ── Assign ────────────────────────────────────────────────────────────────

    [Fact]
    public void Apply_Assign_FromNew_Succeeds()
    {
        var order = NewOrder(OrderStatus.New);
        var result = OrderStateMachine.Apply(order, OrderTransition.Assign, DispatcherActor(),
            new AssignPayload(_driverRowId, _vehicleId), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Assigned);
        order.DriverId.Should().Be(_driverRowId);
        order.VehicleId.Should().Be(_vehicleId);
        order.AssignedAt.Should().Be(Now);
        order.UpdatedAt.Should().Be(Now);
        result.Events.Should().HaveCount(1);
        result.Events[0].Type.Should().Be(OrderEventType.Assigned);
        result.Events[0].FromStatus.Should().Be(OrderStatus.New);
        result.Events[0].ToStatus.Should().Be(OrderStatus.Assigned);
    }

    [Fact]
    public void Apply_Assign_ByFleetAdmin_Succeeds()
    {
        var order = NewOrder(OrderStatus.New);
        var result = OrderStateMachine.Apply(order, OrderTransition.Assign, FleetAdminActor(),
            new AssignPayload(_driverRowId, _vehicleId), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Assigned);
    }

    [Fact]
    public void Apply_Assign_BySystem_Succeeds()
    {
        var order = NewOrder(OrderStatus.New);
        var result = OrderStateMachine.Apply(order, OrderTransition.Assign, Actor.System,
            new AssignPayload(_driverRowId, _vehicleId), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Assigned);
        result.Events[0].ActorRole.Should().Be(UserRole.System);
        result.Events[0].ActorUserId.Should().BeNull();
    }

    // ── Accept ────────────────────────────────────────────────────────────────

    [Fact]
    public void Apply_Accept_ByAssignedDriver_Succeeds()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = _driverRowId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Accept, AssignedDriverActor(), null, Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Accepted);
        order.AcceptedAt.Should().Be(Now);
        result.Events[0].Type.Should().Be(OrderEventType.Accepted);
        result.DriverStatusChanges.Should().ContainSingle(c => c.DriverId == _driverRowId && c.NewStatus == DriverStatus.EnRoute);
    }

    // ── Decline ───────────────────────────────────────────────────────────────

    [Fact]
    public void Apply_Decline_ByAssignedDriver_Succeeds()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = _driverRowId;
        order.VehicleId = _vehicleId;
        order.AssignedAt = Now.AddMinutes(-1);

        var result = OrderStateMachine.Apply(order, OrderTransition.Decline, AssignedDriverActor(),
            new DeclinePayload("Too far"), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.New);
        order.DriverId.Should().BeNull();
        order.VehicleId.Should().BeNull();
        order.AssignedAt.Should().BeNull();
        result.Events[0].Type.Should().Be(OrderEventType.Declined);
        result.Events[0].Payload.Should().NotBeNull();
    }

    // ── Timeout ───────────────────────────────────────────────────────────────

    [Fact]
    public void Apply_Timeout_BySystem_Succeeds()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = _driverRowId;
        order.VehicleId = _vehicleId;
        order.AssignedAt = Now.AddMinutes(-2);

        var result = OrderStateMachine.Apply(order, OrderTransition.Timeout, Actor.System, null, Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.New);
        order.DriverId.Should().BeNull();
        order.VehicleId.Should().BeNull();
        order.AssignedAt.Should().BeNull();
        result.Events[0].Type.Should().Be(OrderEventType.Timeout);
    }

    // ── Reassign ──────────────────────────────────────────────────────────────

    private static readonly Guid _newDriverRowId = Guid.CreateVersion7();
    private static readonly Guid _newVehicleId = Guid.CreateVersion7();

    [Fact]
    public void Apply_Reassign_FromAssigned_ReleasesOldDriver()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = _driverRowId;
        order.VehicleId = _vehicleId;
        order.AssignedAt = Now.AddMinutes(-1);

        var result = OrderStateMachine.Apply(order, OrderTransition.Reassign, DispatcherActor(),
            new AssignPayload(_newDriverRowId, _newVehicleId), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Assigned);
        order.DriverId.Should().Be(_newDriverRowId);
        result.ReleasedDriverId.Should().Be(_driverRowId);
        result.DriverStatusChanges.Should().ContainSingle(c => c.DriverId == _driverRowId && c.NewStatus == DriverStatus.Free);
        result.Events[0].Type.Should().Be(OrderEventType.Reassigned);
    }

    [Fact]
    public void Apply_Reassign_FromAccepted_ClearsAcceptedAt()
    {
        var order = NewOrder(OrderStatus.Accepted);
        order.DriverId = _driverRowId;
        order.AssignedAt = Now.AddMinutes(-5);
        order.AcceptedAt = Now.AddMinutes(-3);

        var result = OrderStateMachine.Apply(order, OrderTransition.Reassign, DispatcherActor(),
            new AssignPayload(_newDriverRowId, _newVehicleId), Now);

        result.IsSuccess.Should().BeTrue();
        order.AcceptedAt.Should().BeNull();
        order.ArrivedAt.Should().BeNull();
        order.AssignedAt.Should().Be(Now);
    }

    [Fact]
    public void Apply_Reassign_FromArrived_ClearsArrivedAt()
    {
        var order = NewOrder(OrderStatus.Arrived);
        order.DriverId = _driverRowId;
        order.AssignedAt = Now.AddMinutes(-10);
        order.AcceptedAt = Now.AddMinutes(-8);
        order.ArrivedAt = Now.AddMinutes(-2);

        var result = OrderStateMachine.Apply(order, OrderTransition.Reassign, DispatcherActor(),
            new AssignPayload(_newDriverRowId, _newVehicleId), Now);

        result.IsSuccess.Should().BeTrue();
        order.AcceptedAt.Should().BeNull();
        order.ArrivedAt.Should().BeNull();
    }

    // ── Arrive ────────────────────────────────────────────────────────────────

    [Fact]
    public void Apply_Arrive_ByAssignedDriver_Succeeds()
    {
        var order = NewOrder(OrderStatus.Accepted);
        order.DriverId = _driverRowId;
        order.AcceptedAt = Now.AddMinutes(-5);

        var result = OrderStateMachine.Apply(order, OrderTransition.Arrive, AssignedDriverActor(), null, Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Arrived);
        order.ArrivedAt.Should().Be(Now);
        result.Events[0].Type.Should().Be(OrderEventType.Arrived);
    }

    // ── Start ─────────────────────────────────────────────────────────────────

    [Fact]
    public void Apply_Start_ByAssignedDriver_Succeeds()
    {
        var order = NewOrder(OrderStatus.Arrived);
        order.DriverId = _driverRowId;
        order.ArrivedAt = Now.AddMinutes(-2);

        var result = OrderStateMachine.Apply(order, OrderTransition.Start, AssignedDriverActor(), null, Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.InProgress);
        order.StartedAt.Should().Be(Now);
        result.DriverStatusChanges.Should().ContainSingle(c => c.DriverId == _driverRowId && c.NewStatus == DriverStatus.Busy);
    }

    // ── Complete ──────────────────────────────────────────────────────────────

    [Fact]
    public void Apply_Complete_EstimatePrice_Succeeds()
    {
        var order = NewOrder(OrderStatus.InProgress);
        order.DriverId = _driverRowId;
        order.PriceType = PriceType.Estimate;
        order.StartedAt = Now.AddMinutes(-15);

        var result = OrderStateMachine.Apply(order, OrderTransition.Complete, AssignedDriverActor(),
            new CompletePayload(250, PaymentType.Cash), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Completed);
        order.FinalPriceCzk.Should().Be(250);
        order.PaymentType.Should().Be(PaymentType.Cash);
        order.CompletedAt.Should().Be(Now);
        result.DriverStatusChanges.Should().ContainSingle(c => c.DriverId == _driverRowId && c.NewStatus == DriverStatus.Free);
        result.Events.Should().HaveCount(1);
        result.Events[0].Type.Should().Be(OrderEventType.Completed);
    }

    [Fact]
    public void Apply_Complete_FixedPriceSamePrice_Succeeds()
    {
        var order = NewOrder(OrderStatus.InProgress);
        order.DriverId = _driverRowId;
        order.PriceType = PriceType.Fixed;
        order.FixedPriceCzk = 300;
        order.StartedAt = Now.AddMinutes(-20);

        var result = OrderStateMachine.Apply(order, OrderTransition.Complete, AssignedDriverActor(),
            new CompletePayload(300, PaymentType.Card), Now);

        result.IsSuccess.Should().BeTrue();
        result.Events.Should().HaveCount(1, "no price override event when price matches");
    }

    [Fact]
    public void Apply_CompleteFixedPriceDifferentPriceWithReason_EmitsPriceOverriddenEvent()
    {
        var order = NewOrder(OrderStatus.InProgress);
        order.DriverId = _driverRowId;
        order.PriceType = PriceType.Fixed;
        order.FixedPriceCzk = 300;
        order.StartedAt = Now.AddMinutes(-20);

        var result = OrderStateMachine.Apply(order, OrderTransition.Complete, AssignedDriverActor(),
            new CompletePayload(350, PaymentType.Cash, "Detour due to roadblock"), Now);

        result.IsSuccess.Should().BeTrue();
        result.Events.Should().HaveCount(2, "PriceOverridden event alongside Completed");
        result.Events.Should().Contain(e => e.Type == OrderEventType.Completed);
        result.Events.Should().Contain(e => e.Type == OrderEventType.PriceOverridden);
        order.PriceOverrideReason.Should().Be("Detour due to roadblock");
    }

    [Fact]
    public void Apply_CompleteFixedPriceDifferentPriceNoReason_Fails()
    {
        var order = NewOrder(OrderStatus.InProgress);
        order.DriverId = _driverRowId;
        order.PriceType = PriceType.Fixed;
        order.FixedPriceCzk = 300;

        var result = OrderStateMachine.Apply(order, OrderTransition.Complete, AssignedDriverActor(),
            new CompletePayload(350, PaymentType.Cash), Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.IllegalTransition);
    }

    [Fact]
    public void Apply_CompleteFixedPriceDifferentPriceShortReason_Fails()
    {
        var order = NewOrder(OrderStatus.InProgress);
        order.DriverId = _driverRowId;
        order.PriceType = PriceType.Fixed;
        order.FixedPriceCzk = 300;

        var result = OrderStateMachine.Apply(order, OrderTransition.Complete, AssignedDriverActor(),
            new CompletePayload(350, PaymentType.Cash, "abc"), Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.IllegalTransition);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    [Fact]
    public void Apply_Cancel_ByDispatcher_FromNew_Succeeds()
    {
        var order = NewOrder(OrderStatus.New);
        order.CustomerUserId = _customerId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel, DispatcherActor(),
            new CancelPayload("Order withdrawn"), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Cancelled);
        order.CancelledAt.Should().Be(Now);
        order.CancelledByRole.Should().Be(UserRole.Dispatcher);
    }

    [Fact]
    public void Apply_Cancel_ByDispatcher_FromArrived_Succeeds()
    {
        var order = NewOrder(OrderStatus.Arrived);
        order.DriverId = _driverRowId;
        order.ArrivedAt = Now.AddMinutes(-1);

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel, DispatcherActor(),
            new CancelPayload("Customer unreachable"), Now);

        result.IsSuccess.Should().BeTrue();
        result.DriverStatusChanges.Should().ContainSingle(c => c.DriverId == _driverRowId && c.NewStatus == DriverStatus.Free);
    }

    [Fact]
    public void Apply_Cancel_ByCustomer_FromNew_Succeeds()
    {
        var order = NewOrder(OrderStatus.New);
        order.CustomerUserId = _customerId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel,
            CustomerActor(_customerId), new CancelPayload("Changed mind"), Now);

        result.IsSuccess.Should().BeTrue();
        order.CancelledByRole.Should().Be(UserRole.Customer);
    }

    [Fact]
    public void Apply_Cancel_ByCustomer_FromAccepted_Succeeds()
    {
        var order = NewOrder(OrderStatus.Accepted);
        order.CustomerUserId = _customerId;
        order.DriverId = _driverRowId;
        order.AcceptedAt = Now.AddMinutes(-2);

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel,
            CustomerActor(_customerId), new CancelPayload("Emergency"), Now);

        result.IsSuccess.Should().BeTrue();
        result.DriverStatusChanges.Should().ContainSingle(c => c.DriverId == _driverRowId && c.NewStatus == DriverStatus.Free);
    }

    [Fact]
    public void Apply_Cancel_ByDriver_NoShow_After5Min_Succeeds()
    {
        var order = NewOrder(OrderStatus.Arrived);
        order.CustomerUserId = _customerId;
        order.DriverId = _driverRowId;
        order.ArrivedAt = Now.AddMinutes(-6);

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel, AssignedDriverActor(),
            new CancelPayload("no-show"), Now);

        result.IsSuccess.Should().BeTrue();
        order.CancelledByRole.Should().Be(UserRole.Driver);
        result.DriverStatusChanges.Should().ContainSingle(c => c.DriverId == _driverRowId && c.NewStatus == DriverStatus.Free);
    }

    // ── Disallowed transitions (>= 10) ────────────────────────────────────────

    [Fact]
    public void Apply_Accept_ByCustomer_ReturnsNotEntitled()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = _driverRowId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Accept, CustomerActor(), null, Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.NotEntitled);
    }

    [Fact]
    public void Apply_Accept_ByOtherDriver_ReturnsNotEntitled()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = Guid.CreateVersion7(); // different driver

        var otherDriver = new Actor(Guid.CreateVersion7(), UserRole.Driver, Guid.CreateVersion7());
        var result = OrderStateMachine.Apply(order, OrderTransition.Accept, otherDriver, null, Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.NotEntitled);
    }

    [Fact]
    public void Apply_Accept_FromWrongStatus_ReturnsIllegalTransition()
    {
        var order = NewOrder(OrderStatus.New); // Not Assigned
        order.DriverId = _driverRowId; // Set so entitlement passes, status check fails

        var result = OrderStateMachine.Apply(order, OrderTransition.Accept, AssignedDriverActor(), null, Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.IllegalTransition);
    }

    [Fact]
    public void Apply_Arrive_ByCustomer_ReturnsNotEntitled()
    {
        var order = NewOrder(OrderStatus.Accepted);
        order.DriverId = _driverRowId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Arrive, CustomerActor(), null, Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.NotEntitled);
    }

    [Fact]
    public void Apply_Start_ByOtherDriver_ReturnsNotEntitled()
    {
        var order = NewOrder(OrderStatus.Arrived);
        order.DriverId = Guid.CreateVersion7(); // different driver

        var otherDriver = new Actor(Guid.CreateVersion7(), UserRole.Driver, Guid.CreateVersion7());
        var result = OrderStateMachine.Apply(order, OrderTransition.Start, otherDriver, null, Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.NotEntitled);
    }

    [Fact]
    public void Apply_Cancel_ByDriver_At3Min_ReturnsIllegalTransition()
    {
        var order = NewOrder(OrderStatus.Arrived);
        order.DriverId = _driverRowId;
        order.ArrivedAt = Now.AddMinutes(-3); // Only 3 minutes, needs 5

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel, AssignedDriverActor(),
            new CancelPayload("no-show"), Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.IllegalTransition);
    }

    [Fact]
    public void Apply_Cancel_ByCustomer_FromArrived_ReturnsIllegalTransition()
    {
        var order = NewOrder(OrderStatus.Arrived);
        order.CustomerUserId = _customerId;
        order.DriverId = _driverRowId;
        order.ArrivedAt = Now.AddMinutes(-1);

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel,
            CustomerActor(_customerId), new CancelPayload("Changed mind"), Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.IllegalTransition,
            "Customer cannot cancel from Arrived");
    }

    [Fact]
    public void Apply_Cancel_ByCustomer_WrongUser_ReturnsNotEntitled()
    {
        var order = NewOrder(OrderStatus.New);
        order.CustomerUserId = Guid.CreateVersion7(); // different customer

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel,
            CustomerActor(_customerId), new CancelPayload("Cancel"), Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.NotEntitled);
    }

    [Fact]
    public void Apply_Cancel_ByDispatcher_FromInProgress_ReturnsIllegalTransition()
    {
        var order = NewOrder(OrderStatus.InProgress);

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel, DispatcherActor(),
            new CancelPayload("Abort"), Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.IllegalTransition);
    }

    [Fact]
    public void Apply_Complete_NullPayload_ReturnsIllegalTransition()
    {
        var order = NewOrder(OrderStatus.InProgress);
        order.DriverId = _driverRowId;

        // Passing null payload (no CompletePayload) should fail.
        var result = OrderStateMachine.Apply(order, OrderTransition.Complete, AssignedDriverActor(), null, Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.IllegalTransition);
    }

    [Fact]
    public void Apply_Timeout_ByDispatcher_ReturnsNotEntitled()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = _driverRowId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Timeout, DispatcherActor(), null, Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.NotEntitled);
    }

    [Fact]
    public void Apply_Assign_ByCustomer_ReturnsNotEntitled()
    {
        var order = NewOrder(OrderStatus.New);

        var result = OrderStateMachine.Apply(order, OrderTransition.Assign, CustomerActor(),
            new AssignPayload(_driverRowId, _vehicleId), Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.NotEntitled);
    }

    [Fact]
    public void Apply_Reassign_ByDriver_ReturnsNotEntitled()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = _driverRowId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Reassign, AssignedDriverActor(),
            new AssignPayload(_newDriverRowId, _newVehicleId), Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.NotEntitled);
    }

    [Fact]
    public void Apply_Decline_ByOtherDriver_ReturnsNotEntitled()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = Guid.CreateVersion7(); // different driver row

        var otherDriver = new Actor(Guid.CreateVersion7(), UserRole.Driver, Guid.CreateVersion7());
        var result = OrderStateMachine.Apply(order, OrderTransition.Decline, otherDriver,
            new DeclinePayload("Too far"), Now);

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.NotEntitled);
    }

    [Fact]
    public void Apply_Cancel_ByDriver_WrongReason_ReturnsIllegalTransition()
    {
        var order = NewOrder(OrderStatus.Arrived);
        order.DriverId = _driverRowId;
        order.ArrivedAt = Now.AddMinutes(-6); // >= 5 min, so time is satisfied

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel, AssignedDriverActor(),
            new CancelPayload("traffic"), Now); // wrong reason — must be "no-show"

        result.IsSuccess.Should().BeFalse();
        result.FailureKind.Should().Be(TransitionFailureKind.IllegalTransition,
            "Driver cancellation reason must be 'no-show'");
    }

    // ── AllowedFor ────────────────────────────────────────────────────────────

    [Fact]
    public void AllowedFor_NewStatus_DispatcherCanAssignAndCancel()
    {
        var allowed = OrderStateMachine.AllowedFor(OrderStatus.New, UserRole.Dispatcher, false);

        allowed.Should().Contain(OrderTransition.Assign);
        allowed.Should().Contain(OrderTransition.Cancel);
        allowed.Should().NotContain(OrderTransition.Accept);
    }

    [Fact]
    public void AllowedFor_AssignedStatus_AssignedDriverCanAcceptAndDecline()
    {
        var allowed = OrderStateMachine.AllowedFor(OrderStatus.Assigned, UserRole.Driver, true);

        allowed.Should().Contain(OrderTransition.Accept);
        allowed.Should().Contain(OrderTransition.Decline);
        allowed.Should().NotContain(OrderTransition.Arrive);
    }

    [Fact]
    public void AllowedFor_AssignedStatus_NonAssignedDriverCannotAccept()
    {
        var allowed = OrderStateMachine.AllowedFor(OrderStatus.Assigned, UserRole.Driver, false);

        allowed.Should().NotContain(OrderTransition.Accept);
        allowed.Should().NotContain(OrderTransition.Decline);
    }

    [Fact]
    public void AllowedFor_InProgressStatus_OnlyAssignedDriverCanComplete()
    {
        var allowed = OrderStateMachine.AllowedFor(OrderStatus.InProgress, UserRole.Driver, true);
        allowed.Should().Contain(OrderTransition.Complete);

        var dispatcherAllowed = OrderStateMachine.AllowedFor(OrderStatus.InProgress, UserRole.Dispatcher, false);
        dispatcherAllowed.Should().NotContain(OrderTransition.Complete);
        dispatcherAllowed.Should().NotContain(OrderTransition.Cancel);
    }

    [Fact]
    public void AllowedFor_ArrivedStatus_DriverCanStartAndCancelNoShow()
    {
        var allowed = OrderStateMachine.AllowedFor(OrderStatus.Arrived, UserRole.Driver, true);

        allowed.Should().Contain(OrderTransition.Start);
        allowed.Should().Contain(OrderTransition.Cancel);
    }

    [Fact]
    public void AllowedFor_CompletedStatus_NothingAllowed()
    {
        var allowed = OrderStateMachine.AllowedFor(OrderStatus.Completed, UserRole.Dispatcher, false);
        allowed.Should().BeEmpty();

        var driverAllowed = OrderStateMachine.AllowedFor(OrderStatus.Completed, UserRole.Driver, true);
        driverAllowed.Should().BeEmpty();
    }

    [Fact]
    public void AllowedFor_FleetAdmin_SameAsDispatcher()
    {
        var dispatcher = OrderStateMachine.AllowedFor(OrderStatus.New, UserRole.Dispatcher, false);
        var fleetAdmin = OrderStateMachine.AllowedFor(OrderStatus.New, UserRole.FleetAdmin, false);

        fleetAdmin.Should().BeEquivalentTo(dispatcher);
    }

    // ── Cancel matrix-cell unit tests (carry-forward WI-09) ─────────────────

    [Fact]
    public void Apply_Cancel_DispatcherFromAssigned_Succeeds()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = _driverRowId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel, DispatcherActor(),
            new CancelPayload("dispatcher cancelled"), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Cancelled);
    }

    [Fact]
    public void Apply_Cancel_DispatcherFromAccepted_Succeeds()
    {
        var order = NewOrder(OrderStatus.Accepted);
        order.DriverId = _driverRowId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel, DispatcherActor(),
            new CancelPayload("dispatcher cancelled from accepted"), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Cancelled);
    }

    [Fact]
    public void Apply_Cancel_CustomerFromAssigned_Succeeds()
    {
        var order = NewOrder(OrderStatus.Assigned);
        order.DriverId = _driverRowId;
        order.CustomerUserId = _customerId;

        var result = OrderStateMachine.Apply(order, OrderTransition.Cancel, CustomerActor(_customerId),
            new CancelPayload("customer cancelled"), Now);

        result.IsSuccess.Should().BeTrue();
        order.Status.Should().Be(OrderStatus.Cancelled);
    }

    // ── Event FleetId propagation ─────────────────────────────────────────────

    [Fact]
    public void Apply_Assign_EventHasOrderFleetId()
    {
        var order = NewOrder(OrderStatus.New);

        var result = OrderStateMachine.Apply(order, OrderTransition.Assign, DispatcherActor(),
            new AssignPayload(_driverRowId, _vehicleId), Now);

        result.IsSuccess.Should().BeTrue();
        result.Events[0].FleetId.Should().Be(order.FleetId);
    }
}
