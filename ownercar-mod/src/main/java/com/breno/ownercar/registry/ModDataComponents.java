package com.breno.ownercar.registry;

import com.breno.ownercar.OwnerCarMod;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.Registries;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.function.Supplier;

/** Registra os DataComponents customizados (o "dono" da chave). */
public class ModDataComponents {

    public static final DeferredRegister<DataComponentType<?>> COMPONENTS =
            DeferredRegister.create(Registries.DATA_COMPONENT_TYPE, OwnerCarMod.MOD_ID);

    public static final Supplier<DataComponentType<OwnerData>> OWNER = COMPONENTS.register("owner",
            () -> DataComponentType.<OwnerData>builder()
                    .persistent(OwnerData.CODEC)
                    .networkSynchronized(OwnerData.STREAM_CODEC)
                    .build());

    public static void register(IEventBus bus) {
        COMPONENTS.register(bus);
    }
}
