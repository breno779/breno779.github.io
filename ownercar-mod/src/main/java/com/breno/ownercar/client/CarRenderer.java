package com.breno.ownercar.client;

import com.breno.ownercar.OwnerCarMod;
import com.breno.ownercar.entity.CarEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.resources.ResourceLocation;

/** Desenha o carro no mundo. */
public class CarRenderer extends EntityRenderer<CarEntity> {

    private static final ResourceLocation TEXTURE =
            ResourceLocation.fromNamespaceAndPath(OwnerCarMod.MOD_ID, "textures/entity/car.png");

    private final CarModel model;

    public CarRenderer(EntityRendererProvider.Context context) {
        super(context);
        this.model = new CarModel(context.bakeLayer(CarModel.LAYER_LOCATION));
        this.shadowRadius = 1.4f;
    }

    @Override
    public void render(CarEntity entity, float entityYaw, float partialTicks, PoseStack poseStack,
                       MultiBufferSource buffer, int packedLight) {
        poseStack.pushPose();

        // Levanta o modelo e vira ele para cima (modelo e construido com Y para baixo).
        poseStack.translate(0.0D, 1.0D, 0.0D);
        poseStack.scale(-1.0F, -1.0F, 1.0F);

        // Vira o carro para a direcao em que ele aponta.
        // Se o carro andar "de re" visualmente, troque -entityYaw por (180 - entityYaw).
        poseStack.mulPose(Axis.YP.rotationDegrees(-entityYaw));

        this.model.setupAnim(entity, 0f, 0f, 0f, 0f, 0f);
        VertexConsumer vc = buffer.getBuffer(this.model.renderType(TEXTURE));
        this.model.renderToBuffer(poseStack, vc, packedLight, net.minecraft.client.renderer.texture.OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);

        poseStack.popPose();
        super.render(entity, entityYaw, partialTicks, poseStack, buffer, packedLight);
    }

    @Override
    public ResourceLocation getTextureLocation(CarEntity entity) {
        return TEXTURE;
    }
}
