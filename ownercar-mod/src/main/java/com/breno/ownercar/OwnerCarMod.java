package com.breno.ownercar;

import com.breno.ownercar.registry.ModDataComponents;
import com.breno.ownercar.registry.ModEntities;
import com.breno.ownercar.registry.ModItems;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Ponto de entrada do mod "Owner Car".
 *
 * Adiciona:
 *  - um carro dirigivel (entidade) com dono por UUID;
 *  - uma chave que pertence ao dono (so o dono liga/desliga e abre/fecha);
 *  - um sistema de gasolina com uma Lata de Gasolina para abastecer.
 */
@Mod(OwnerCarMod.MOD_ID)
public class OwnerCarMod {

    public static final String MOD_ID = "ownercar";
    public static final Logger LOGGER = LoggerFactory.getLogger("OwnerCar");

    public OwnerCarMod(IEventBus modEventBus) {
        ModDataComponents.register(modEventBus);
        ModEntities.register(modEventBus);
        ModItems.register(modEventBus);

        LOGGER.info("Owner Car carregado.");
    }
}
