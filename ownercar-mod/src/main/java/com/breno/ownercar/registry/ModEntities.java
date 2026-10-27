package com.breno.ownercar.registry;

import com.breno.ownercar.OwnerCarMod;
import com.breno.ownercar.entity.CarEntity;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.function.Supplier;

/** Registra a entidade do carro. */
public class ModEntities {

    public static final DeferredRegister<EntityType<?>> ENTITIES =
            DeferredRegister.create(Registries.ENTITY_TYPE, OwnerCarMod.MOD_ID);

    public static final Supplier<EntityType<CarEntity>> CAR = ENTITIES.register("car",
            () -> EntityType.Builder.<CarEntity>of(CarEntity::new, MobCategory.MISC)
                    .sized(1.6f, 1.0f)          // largura x altura da hitbox
                    .passengerAttachment(0.6f)  // altura do assento
                    .clientTrackingRange(10)
                    .updateInterval(2)
                    .build("car"));

    public static void register(IEventBus bus) {
        ENTITIES.register(bus);
    }
}
