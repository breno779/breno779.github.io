package com.breno.ownercar.registry;

import com.breno.ownercar.OwnerCarMod;
import com.breno.ownercar.item.CarItem;
import com.breno.ownercar.item.CarKeyItem;
import com.breno.ownercar.item.GasCanItem;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.function.Supplier;

/** Registra os itens e a aba criativa. */
public class ModItems {

    public static final DeferredRegister.Items ITEMS = DeferredRegister.createItems(OwnerCarMod.MOD_ID);
    public static final DeferredRegister<CreativeModeTab> TABS =
            DeferredRegister.create(Registries.CREATIVE_MODE_TAB, OwnerCarMod.MOD_ID);

    // Item que, usado no chao, "estaciona" o carro e define voce como dono.
    public static final DeferredItem<CarItem> CAR = ITEMS.registerItem("car",
            CarItem::new, new Item.Properties().stacksTo(1));

    // A chave: liga/desliga e tranca/destranca o carro. Fica marcada com o nome do dono.
    public static final DeferredItem<CarKeyItem> CAR_KEY = ITEMS.registerItem("car_key",
            CarKeyItem::new, new Item.Properties().stacksTo(1));

    // Lata de gasolina: abastece o carro.
    public static final DeferredItem<GasCanItem> GAS_CAN = ITEMS.registerItem("gas_can",
            GasCanItem::new, new Item.Properties().stacksTo(16));

    public static final Supplier<CreativeModeTab> TAB = TABS.register("ownercar_tab",
            () -> CreativeModeTab.builder()
                    .title(Component.translatable("itemGroup.ownercar"))
                    .icon(() -> new ItemStack(CAR.get()))
                    .displayItems((params, output) -> {
                        output.accept(CAR.get());
                        output.accept(CAR_KEY.get());
                        output.accept(GAS_CAN.get());
                    })
                    .build());

    public static void register(IEventBus bus) {
        ITEMS.register(bus);
        TABS.register(bus);
    }
}
