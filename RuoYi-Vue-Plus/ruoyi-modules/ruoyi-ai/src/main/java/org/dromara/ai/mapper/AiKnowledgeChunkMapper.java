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
        INSERT INTO ai_knowledge_chunk (kb_id, doc_id, chunk_order, content, token_count, embedding, status, chunk_type, question, create_time)
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
            #{chunk.status},
            <choose>
                <when test="chunk.chunkType != null and chunk.chunkType != ''">
                    #{chunk.chunkType}
                </when>
                <otherwise>
                    'text'
                </otherwise>
            </choose>,
            #{chunk.question},
            #{chunk.createTime}
        )
        </script>
    """)
    @Options(useGeneratedKeys = true, keyProperty = "chunk.id")
    int insertChunkWithVector(@Param("chunk") AiKnowledgeChunk chunk, @Param("embedding") String embedding);

    /**
     * 更新切片及向量数据
     */
    @org.apache.ibatis.annotations.Update("""
        <script>
        UPDATE ai_knowledge_chunk
        SET content = #{chunk.content},
            token_count = #{chunk.tokenCount},
            question = #{chunk.question},
            chunk_type = #{chunk.chunkType}
            <if test="embedding != null and embedding != ''">
                , embedding = #{embedding}::vector
            </if>
        WHERE id = #{chunk.id}
        </script>
    """)
    int updateChunkWithVector(@Param("chunk") AiKnowledgeChunk chunk, @Param("embedding") String embedding);

    /**
     * PostgreSQL pgvector HNSW 余弦相似度召回 (1 - (embedding <=> :vector))
     */
    @Select("""
        SELECT id, kb_id, doc_id, chunk_order, content, token_count, status, chunk_type, question, create_time,
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
     * 关键字精确/模糊匹配辅助检索 (优先匹配 question 或 content)
     */
    @Select("""
        SELECT id, kb_id, doc_id, chunk_order, content, token_count, status, chunk_type, question, create_time,
               CASE 
                 WHEN question ILIKE CONCAT('%', #{keyword}, '%') THEN 0.8500
                 ELSE 0.7500
               END AS score
        FROM ai_knowledge_chunk
        WHERE kb_id = #{kbId} AND status = '0' 
          AND (content ILIKE CONCAT('%', #{keyword}, '%') OR question ILIKE CONCAT('%', #{keyword}, '%'))
        ORDER BY id ASC
        LIMIT #{topK}
    """)
    List<AiKnowledgeChunk> searchKeywordChunks(
        @Param("kbId") Long kbId,
        @Param("keyword") String keyword,
        @Param("topK") int topK
    );
}
