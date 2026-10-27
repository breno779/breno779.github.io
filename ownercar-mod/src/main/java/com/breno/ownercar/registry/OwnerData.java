package com.breno.ownercar.registry;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

import java.util.UUID;

/**
 * Dado "dono" guardado na chave (DataComponent).
 * Guarda o UUID e o nome do jogador dono.
 */
public record OwnerData(UUID id, String name) {

    public static final Codec<OwnerData> CODEC = RecordCodecBuilder.create(instance -> instance.group(
            UUIDUtil.CODEC.fieldOf("id").forGetter(OwnerData::id),
            Codec.STRING.fieldOf("name").forGetter(OwnerData::name)
    ).apply(instance, OwnerData::new));

    public static final StreamCodec<ByteBuf, OwnerData> STREAM_CODEC = StreamCodec.composite(
            UUIDUtil.STREAM_CODEC, OwnerData::id,
            ByteBufCodecs.STRING_UTF8, OwnerData::name,
            OwnerData::new
    );
}
