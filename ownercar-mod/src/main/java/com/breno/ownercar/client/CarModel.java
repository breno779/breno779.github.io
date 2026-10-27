package com.breno.ownercar.client;

import com.breno.ownercar.OwnerCarMod;
import com.breno.ownercar.entity.CarEntity;
import net.minecraft.client.model.HierarchicalModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.resources.ResourceLocation;

/**
 * Modelo 3D do carro (estilo "caixinha" do Minecraft), inspirado num hatch branco compacto.
 * Coordenadas em 1/16 de bloco, com Y "para baixo" (padrao dos modelos de entidade);
 * o {@link CarRenderer} vira o modelo para cima na hora de desenhar.
 */
public class CarModel extends HierarchicalModel<CarEntity> {

    public static final ModelLayerLocation LAYER_LOCATION =
            new ModelLayerLocation(ResourceLocation.fromNamespaceAndPath(OwnerCarMod.MOD_ID, "car"), "main");

    private final ModelPart root;

    public CarModel(ModelPart root) {
        this.root = root;
    }

    public static LayerDefinition createBodyLayer() {
        MeshDefinition mesh = new MeshDefinition();
        PartDefinition parts = mesh.getRoot();

        // Carroceria (chassi) - parte baixa e larga
        parts.addOrReplaceChild("body",
                CubeListBuilder.create()
                        .texOffs(0, 0)
                        .addBox(-9f, 8f, -16f, 18f, 6f, 32f),
                PartPose.ZERO);

        // Cabine / teto - parte de cima com "vidros"
        parts.addOrReplaceChild("cabin",
                CubeListBuilder.create()
                        .texOffs(0, 40)
                        .addBox(-8f, 2f, -8f, 16f, 6f, 18f),
                PartPose.ZERO);

        // Rodas (4 caixas). Mesma regiao de textura para todas.
        parts.addOrReplaceChild("wheel_fl",
                CubeListBuilder.create().texOffs(0, 70).addBox(-11f, 10f, -12f, 3f, 6f, 6f), PartPose.ZERO);
        parts.addOrReplaceChild("wheel_fr",
                CubeListBuilder.create().texOffs(0, 70).addBox(8f, 10f, -12f, 3f, 6f, 6f), PartPose.ZERO);
        parts.addOrReplaceChild("wheel_bl",
                CubeListBuilder.create().texOffs(0, 70).addBox(-11f, 10f, 6f, 3f, 6f, 6f), PartPose.ZERO);
        parts.addOrReplaceChild("wheel_br",
                CubeListBuilder.create().texOffs(0, 70).addBox(8f, 10f, 6f, 3f, 6f, 6f), PartPose.ZERO);

        return LayerDefinition.create(mesh, 128, 128);
    }

    @Override
    public void setupAnim(CarEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
        // sem animacao por enquanto (rodas poderiam girar aqui no futuro)
    }

    @Override
    public ModelPart root() {
        return root;
    }
}
