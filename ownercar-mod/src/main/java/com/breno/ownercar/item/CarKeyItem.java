package com.breno.ownercar.item;

import com.breno.ownercar.registry.ModDataComponents;
import com.breno.ownercar.registry.OwnerData;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;

import java.util.List;

/**
 * A chave do carro. Guarda o nome do dono (quando usada pela primeira vez)
 * e serve para ligar/desligar e trancar/destrancar o carro.
 *
 * A logica de uso acontece em {@link com.breno.ownercar.entity.CarEntity#interact}.
 */
public class CarKeyItem extends Item {

    public CarKeyItem(Properties properties) {
        super(properties);
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext context, List<Component> tooltip, TooltipFlag flag) {
        OwnerData owner = stack.get(ModDataComponents.OWNER.get());
        if (owner != null) {
            tooltip.add(Component.translatable("tooltip.ownercar.key_owner", owner.name()).withStyle(ChatFormatting.GOLD));
        } else {
            tooltip.add(Component.translatable("tooltip.ownercar.key_blank").withStyle(ChatFormatting.GRAY));
        }
        tooltip.add(Component.translatable("tooltip.ownercar.key_help").withStyle(ChatFormatting.DARK_GRAY));
    }

    @Override
    public boolean isFoil(ItemStack stack) {
        // brilha quando ja esta vinculada a um dono
        return stack.has(ModDataComponents.OWNER.get());
    }
}
