package com.breno.ownercar.client;

import com.breno.ownercar.OwnerCarMod;
import com.breno.ownercar.registry.ModEntities;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;

/**
 * Codigo que so roda no cliente: registra o renderer e o layer do modelo do carro.
 */
@Mod(value = OwnerCarMod.MOD_ID, dist = Dist.CLIENT)
public class OwnerCarClient {

    public OwnerCarClient(IEventBus modEventBus) {
        modEventBus.addListener(this::registerRenderers);
        modEventBus.addListener(this::registerLayers);
    }

    private void registerRenderers(EntityRenderersEvent.RegisterRenderers event) {
        event.registerEntityRenderer(ModEntities.CAR.get(), CarRenderer::new);
    }

    private void registerLayers(EntityRenderersEvent.RegisterLayerDefinitions event) {
        event.registerLayerDefinition(CarModel.LAYER_LOCATION, CarModel::createBodyLayer);
    }
}
