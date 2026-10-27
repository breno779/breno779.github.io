package com.breno.ownercar.item;

import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;

import java.util.List;

/**
 * Lata de gasolina. Usada (clique direito) no carro para abastecer.
 * A logica de abastecimento acontece em {@link com.breno.ownercar.entity.CarEntity#interact}.
 */
public class GasCanItem extends Item {

    public GasCanItem(Properties properties) {
        super(properties);
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext context, List<Component> tooltip, TooltipFlag flag) {
        tooltip.add(Component.translatable("tooltip.ownercar.gas_help"));
    }
}
