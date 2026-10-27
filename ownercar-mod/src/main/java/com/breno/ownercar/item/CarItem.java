package com.breno.ownercar.item;

import com.breno.ownercar.entity.CarEntity;
import com.breno.ownercar.registry.ModEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevel;

import java.util.List;

/**
 * Item do carro. Clicar com ele no chao "coloca" o carro no mundo
 * e define quem colocou como o dono.
 */
public class CarItem extends Item {

    public CarItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        Level level = context.getLevel();
        if (!(level instanceof ServerLevel serverLevel)) {
            return InteractionResult.SUCCESS; // deixa o cliente "prever" o clique
        }

        BlockPos spawnPos = context.getClickedPos().above();
        Player player = context.getPlayer();

        CarEntity car = new CarEntity(ModEntities.CAR.get(), level);
        float yaw = player != null ? player.getYRot() : 0f;
        car.moveTo(spawnPos.getX() + 0.5, spawnPos.getY(), spawnPos.getZ() + 0.5, yaw, 0f);

        if (player != null) {
            car.setOwner(player.getUUID(), player.getGameProfile().getName());
            car.setLocked(false); // nasce destrancado para o dono usar na hora
        }

        serverLevel.addFreshEntity(car);
        context.getItemInHand().shrink(1);

        if (player != null) {
            player.displayClientMessage(Component.translatable("message.ownercar.owner_set"), true);
        }
        return InteractionResult.CONSUME;
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext context, List<Component> tooltip, net.minecraft.world.item.TooltipFlag flag) {
        tooltip.add(Component.translatable("tooltip.ownercar.car_help"));
    }
}
