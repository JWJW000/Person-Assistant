package org.dromara.ai.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.dromara.ai.domain.entity.AiKnowledgeChunk;
import org.dromara.common.mybatis.core.mapper.BaseMapperPlus;

import java.util.List;

/**
 * 知识切片与向量检索 Mapper (PostgreSQL pgvector)
 *
 * @author ruoyi
 */
public interface AiKnowledgeChunkMapper extends BaseMapperPlus<AiKnowledgeChunk, AiKnowledgeChunk> {

    /**
     * 插入切片及向量数据 (若向量不为空则转为 pgvector vector(1536))
     */
    @Insert("""
        <script>
        INSERT INTO ai_knowledge_chunk (kb_id, doc_id, chunk_order, content, token_count, embedding, status, create_time)
        VALUES (
            #{chunk.kbId}, #{chunk.docId}, #{chunk.chunkOrder}, #{chunk.content}, #{chunk.tokenCount},
            <choose>
                <when test="embedding != null and embedding != ''">
                    #{embedding}::vector
                </when>
                <otherwise>
                    NULL
                </otherwise>
            </choose>,
            #{chunk.status}, #{chunk.createTime}
        )
        </script>
    """)
    @Options(useGeneratedKeys = true, keyProperty = "chunk.id")
    int insertChunkWithVector(@Param("chunk") AiKnowledgeChunk chunk, @Param("embedding") String embedding);

    /**
     * PostgreSQL pgvector HNSW 余弦相似度召回 (1 - (embedding <=> :vector))
     */
    @Select("""
        SELECT id, kb_id, doc_id, chunk_order, content, token_count, status, create_time,
               ROUND((1 - (embedding <=> #{queryVector}::vector))::numeric, 4) AS score
        FROM ai_knowledge_chunk
        WHERE kb_id = #{kbId} AND status = '0' AND embedding IS NOT NULL
        ORDER BY embedding <=> #{queryVector}::vector ASC
        LIMIT #{topK}
    """)
    List<AiKnowledgeChunk> searchVectorChunks(
        @Param("kbId") Long kbId,
        @Param("queryVector") String queryVector,
        @Param("topK") int topK
    );

    /**
     * 关键字/模糊匹配辅助检索
     */
    @Select("""
        SELECT id, kb_id, doc_id, chunk_order, content, token_count, status, create_time,
               0.8000 AS score
        FROM ai_knowledge_chunk
        WHERE kb_id = #{kbId} AND status = '0' AND content ILIKE CONCAT('%', #{keyword}, '%')
        ORDER BY id ASC
        LIMIT #{topK}
    """)
    List<AiKnowledgeChunk> searchKeywordChunks(
        @Param("kbId") Long kbId,
        @Param("keyword") String keyword,
        @Param("topK") int topK
    );
}
