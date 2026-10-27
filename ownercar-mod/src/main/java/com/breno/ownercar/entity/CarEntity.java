package com.breno.ownercar.entity;

import com.breno.ownercar.registry.ModDataComponents;
import com.breno.ownercar.registry.ModItems;
import com.breno.ownercar.registry.OwnerData;
import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.UUID;

/**
 * O carro dirigivel.
 *
 * Regras:
 *  - Tem um dono (UUID). So o dono pode entrar, trancar/destrancar e ligar/desligar.
 *  - Precisa de gasolina para andar. A gasolina acaba conforme voce dirige.
 *
 * Controles (segurando a CHAVE, como dono):
 *  - Clique direito ............ liga/desliga o motor.
 *  - Shift + clique direito .... tranca/destranca (abre/fecha) o carro.
 * Com a mao vazia:
 *  - Clique direito ............ entra no carro (se destrancado).
 * Com a LATA DE GASOLINA:
 *  - Clique direito ............ abastece.
 * Dirigindo: W/S aceleram/re, A/D esterca. Bater no carro (como dono) recolhe o item.
 */
public class CarEntity extends Entity {

    // ---- dados sincronizados cliente<->servidor ----
    private static final EntityDataAccessor<Float> DATA_FUEL =
            SynchedEntityData.defineId(CarEntity.class, EntityDataSerializers.FLOAT);
    private static final EntityDataAccessor<Boolean> DATA_ENGINE_ON =
            SynchedEntityData.defineId(CarEntity.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> DATA_LOCKED =
            SynchedEntityData.defineId(CarEntity.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<String> DATA_OWNER_NAME =
            SynchedEntityData.defineId(CarEntity.class, EntityDataSerializers.STRING);

    // ---- constantes de fisica / combustivel ----
    public static final float MAX_FUEL = 100.0f;
    private static final float GAS_PER_CAN = 50.0f;     // quanto cada lata abastece
    private static final float IDLE_FUEL = 0.004f;      // gasto por tick com motor ligado parado
    private static final float FUEL_PER_BLOCK = 0.12f;  // gasto por bloco percorrido

    private static final float ACCEL = 0.03f;           // aceleracao por tick
    private static final float MAX_SPEED = 0.5f;         // velocidade maxima para frente (blocos/tick)
    private static final float MAX_REVERSE = 0.18f;      // velocidade maxima de re
    private static final float FRICTION = 0.90f;         // desaceleracao natural
    private static final float TURN_RATE = 3.2f;         // graus de esterçamento por tick

    private static final double GRAVITY = -0.08;

    // ---- estado (servidor) ----
    @Nullable
    private UUID ownerId;
    private float forwardSpeed = 0f;

    // gasto de gasolina por distancia (servidor)
    private double lastXForFuel;
    private double lastZForFuel;

    // ---- interpolacao (clientes que nao controlam) ----
    private int lerpSteps;
    private double lerpX, lerpY, lerpZ;
    private double lerpYRot, lerpXRot;

    public CarEntity(EntityType<?> type, Level level) {
        super(type, level);
        this.blocksBuilding = true;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(DATA_FUEL, 0f);
        builder.define(DATA_ENGINE_ON, false);
        builder.define(DATA_LOCKED, true);
        builder.define(DATA_OWNER_NAME, "");
    }

    // =========================================================
    //  Getters / setters de estado
    // =========================================================
    public float getFuel() {
        return this.entityData.get(DATA_FUEL);
    }

    public void setFuel(float fuel) {
        this.entityData.set(DATA_FUEL, Mth.clamp(fuel, 0f, MAX_FUEL));
    }

    public boolean isEngineOn() {
        return this.entityData.get(DATA_ENGINE_ON);
    }

    public void setEngineOn(boolean on) {
        this.entityData.set(DATA_ENGINE_ON, on);
    }

    public boolean isLocked() {
        return this.entityData.get(DATA_LOCKED);
    }

    public void setLocked(boolean locked) {
        this.entityData.set(DATA_LOCKED, locked);
    }

    public String getOwnerName() {
        return this.entityData.get(DATA_OWNER_NAME);
    }

    private void setOwnerName(String name) {
        this.entityData.set(DATA_OWNER_NAME, name == null ? "" : name);
    }

    public void setOwner(UUID id, String name) {
        this.ownerId = id;
        setOwnerName(name);
    }

    public boolean isOwner(Player player) {
        return ownerId == null || ownerId.equals(player.getUUID());
    }

    // =========================================================
    //  Interacao (chave / gasolina / entrar)
    // =========================================================
    @Override
    public InteractionResult interact(Player player, InteractionHand hand) {
        if (level().isClientSide) {
            return InteractionResult.SUCCESS;
        }

        // primeiro que interage em um carro "sem dono" vira dono
        if (ownerId == null) {
            setOwner(player.getUUID(), player.getGameProfile().getName());
        }

        if (!isOwner(player)) {
            player.displayClientMessage(
                    Component.translatable("message.ownercar.not_owner", getOwnerName()).withStyle(ChatFormatting.RED), true);
            return InteractionResult.FAIL;
        }

        ItemStack held = player.getItemInHand(hand);

        // abastecer
        if (held.is(ModItems.GAS_CAN.get())) {
            return tryRefuel(player, held);
        }

        // chave: liga/desliga ou tranca/destranca
        if (held.is(ModItems.CAR_KEY.get())) {
            stampKey(held, player);
            if (player.isShiftKeyDown()) {
                toggleLock(player);
            } else {
                toggleEngine(player);
            }
            return InteractionResult.CONSUME;
        }

        // mao "comum": tentar entrar
        if (isLocked()) {
            player.displayClientMessage(
                    Component.translatable("message.ownercar.locked").withStyle(ChatFormatting.RED), true);
            return InteractionResult.FAIL;
        }
        player.startRiding(this);
        return InteractionResult.CONSUME;
    }

    private InteractionResult tryRefuel(Player player, ItemStack gasCan) {
        if (getFuel() >= MAX_FUEL) {
            player.displayClientMessage(Component.translatable("message.ownercar.fuel_full").withStyle(ChatFormatting.YELLOW), true);
            return InteractionResult.FAIL;
        }
        setFuel(getFuel() + GAS_PER_CAN);
        if (!player.getAbilities().instabuild) {
            gasCan.shrink(1);
        }
        level().playSound(null, this, SoundEvents.BUCKET_FILL, SoundSource.PLAYERS, 0.8f, 1.1f);
        player.displayClientMessage(Component.translatable("message.ownercar.refuel",
                (int) getFuel(), (int) MAX_FUEL).withStyle(ChatFormatting.GREEN), true);
        return InteractionResult.CONSUME;
    }

    private void toggleEngine(Player player) {
        if (isLocked()) {
            player.displayClientMessage(Component.translatable("message.ownercar.locked").withStyle(ChatFormatting.RED), true);
            return;
        }
        if (!isEngineOn()) {
            if (getFuel() <= 0f) {
                player.displayClientMessage(Component.translatable("message.ownercar.no_fuel").withStyle(ChatFormatting.RED), true);
                return;
            }
            setEngineOn(true);
            level().playSound(null, this, SoundEvents.PISTON_EXTEND, SoundSource.PLAYERS, 0.7f, 0.6f);
            player.displayClientMessage(Component.translatable("message.ownercar.engine_on").withStyle(ChatFormatting.GREEN), true);
        } else {
            setEngineOn(false);
            forwardSpeed = 0f;
            level().playSound(null, this, SoundEvents.PISTON_CONTRACT, SoundSource.PLAYERS, 0.7f, 0.6f);
            player.displayClientMessage(Component.translatable("message.ownercar.engine_off").withStyle(ChatFormatting.YELLOW), true);
        }
    }

    private void toggleLock(Player player) {
        boolean newLocked = !isLocked();
        setLocked(newLocked);
        if (newLocked) {
            setEngineOn(false);
            forwardSpeed = 0f;
            level().playSound(null, this, SoundEvents.IRON_DOOR_CLOSE, SoundSource.PLAYERS, 0.6f, 1.2f);
            player.displayClientMessage(Component.translatable("message.ownercar.lock_on").withStyle(ChatFormatting.RED), true);
        } else {
            level().playSound(null, this, SoundEvents.IRON_DOOR_OPEN, SoundSource.PLAYERS, 0.6f, 1.2f);
            player.displayClientMessage(Component.translatable("message.ownercar.lock_off").withStyle(ChatFormatting.GREEN), true);
        }
    }

    /** Marca a chave com o nome do dono na primeira vez que ela e usada. */
    private void stampKey(ItemStack key, Player player) {
        if (!key.has(ModDataComponents.OWNER.get()) && isOwner(player)) {
            key.set(ModDataComponents.OWNER.get(), new OwnerData(player.getUUID(), player.getGameProfile().getName()));
        }
    }

    // =========================================================
    //  Movimento / fisica
    // =========================================================
    @Nullable
    @Override
    public LivingEntity getControllingPassenger() {
        Entity first = getFirstPassenger();
        return first instanceof LivingEntity living ? living : null;
    }

    @Override
    public void tick() {
        super.tick();

        // ---- gasolina (sempre autoritativo no servidor) ----
        if (!level().isClientSide) {
            if (isEngineOn()) {
                double moved = Math.hypot(getX() - lastXForFuel, getZ() - lastZForFuel);
                float used = IDLE_FUEL + (float) moved * FUEL_PER_BLOCK;
                if (used > 0f) {
                    setFuel(getFuel() - used);
                }
                if (getFuel() <= 0f) {
                    setFuel(0f);
                    setEngineOn(false);
                }
                // HUD: mostra gasolina na action bar do motorista
                if (tickCount % 10 == 0 && getControllingPassenger() instanceof Player driver) {
                    int pct = (int) (getFuel() / MAX_FUEL * 100f);
                    int kmh = (int) (Math.hypot(getDeltaMovement().x, getDeltaMovement().z) * 72); // ~blocos/tick -> km/h aprox
                    driver.displayClientMessage(Component.translatable("message.ownercar.hud", pct, kmh), true);
                }
            }
            lastXForFuel = getX();
            lastZForFuel = getZ();
        }

        // ---- fisica ----
        if (isControlledByLocalInstance()) {
            updatePhysics();
            move(MoverType.SELF, getDeltaMovement());
            if (horizontalCollision) {
                forwardSpeed *= 0.4f; // bateu em algo: perde velocidade
            }
        } else {
            setDeltaMovement(Vec3.ZERO);
        }

        tickLerp();
    }

    private void updatePhysics() {
        Vec3 motion = getDeltaMovement();

        // gravidade / cair
        double my = onGround() ? Math.max(0.0, motion.y) : motion.y + GRAVITY;

        boolean canDrive = isEngineOn() && getFuel() > 0f;
        LivingEntity driver = getControllingPassenger();

        if (canDrive && driver instanceof Player player) {
            float forwardInput = player.zza; // W = +1, S = -1
            float turnInput = player.xxa;    // A = +1 (esquerda), D = -1 (direita)

            // esterçamento (so faz sentido andando)
            if (Math.abs(forwardSpeed) > 0.02f) {
                float dir = forwardSpeed >= 0 ? 1f : -1f;
                // Se o carro esterçar para o lado errado, troque o sinal abaixo.
                setYRot(getYRot() - turnInput * TURN_RATE * dir);
            }

            // acelerar / re
            if (forwardInput > 0) {
                forwardSpeed += ACCEL;
            } else if (forwardInput < 0) {
                forwardSpeed -= ACCEL;
            }
        }

        // atrito / limites
        forwardSpeed *= FRICTION;
        forwardSpeed = Mth.clamp(forwardSpeed, -MAX_REVERSE, MAX_SPEED);
        if (Math.abs(forwardSpeed) < 0.001f) {
            forwardSpeed = 0f;
        }

        // converte velocidade escalar em movimento no eixo do carro
        double rad = Math.toRadians(getYRot());
        double mx = -Math.sin(rad) * forwardSpeed;
        double mz = Math.cos(rad) * forwardSpeed;

        setDeltaMovement(mx, my, mz);
    }

    // interpolacao suave em clientes que nao controlam o carro
    @Override
    public void lerpTo(double x, double y, double z, float yRot, float xRot, int steps) {
        this.lerpX = x;
        this.lerpY = y;
        this.lerpZ = z;
        this.lerpYRot = yRot;
        this.lerpXRot = xRot;
        this.lerpSteps = steps;
    }

    private void tickLerp() {
        if (isControlledByLocalInstance()) {
            lerpSteps = 0;
            syncPacketPositionCodec(getX(), getY(), getZ());
            return;
        }
        if (lerpSteps > 0) {
            double nx = getX() + (lerpX - getX()) / lerpSteps;
            double ny = getY() + (lerpY - getY()) / lerpSteps;
            double nz = getZ() + (lerpZ - getZ()) / lerpSteps;
            float nyaw = getYRot() + (float) (Mth.wrapDegrees(lerpYRot - getYRot()) / lerpSteps);
            float npitch = getXRot() + (float) ((lerpXRot - getXRot()) / lerpSteps);
            lerpSteps--;
            setPos(nx, ny, nz);
            setRot(nyaw, npitch);
        }
    }

    // =========================================================
    //  Colisao / interacao fisica
    // =========================================================
    @Override
    public boolean isPickable() {
        return !isRemoved();
    }

    @Override
    public boolean canBeCollidedWith() {
        return true;
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    @Override
    protected boolean canRide(Entity vehicle) {
        return false; // o carro nao anda em outra entidade
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (level().isClientSide || isRemoved()) {
            return false;
        }
        if (source.getEntity() instanceof Player player) {
            boolean creative = player.getAbilities().instabuild;
            if (!isOwner(player) && !creative) {
                player.displayClientMessage(
                        Component.translatable("message.ownercar.not_owner", getOwnerName()).withStyle(ChatFormatting.RED), true);
                return false;
            }
            // dono (ou criativo) recolhe o carro de volta como item
            ejectPassengers();
            if (!creative) {
                spawnAtLocation(ModItems.CAR.get());
            }
            discard();
            return true;
        }
        return false;
    }

    // =========================================================
    //  Salvar / carregar
    // =========================================================
    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        if (ownerId != null) {
            tag.putUUID("Owner", ownerId);
        }
        tag.putString("OwnerName", getOwnerName());
        tag.putFloat("Fuel", getFuel());
        tag.putBoolean("EngineOn", isEngineOn());
        tag.putBoolean("Locked", isLocked());
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        if (tag.hasUUID("Owner")) {
            ownerId = tag.getUUID("Owner");
        }
        setOwnerName(tag.getString("OwnerName"));
        setFuel(tag.getFloat("Fuel"));
        setEngineOn(tag.getBoolean("EngineOn"));
        setLocked(tag.getBoolean("Locked"));
    }
}
