package org.dromara.ai.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.dromara.ai.domain.entity.AiKnowledgeBase;
import org.dromara.ai.domain.entity.AiKnowledgeChunk;
import org.dromara.ai.domain.entity.AiKnowledgeDocument;
import org.dromara.ai.domain.entity.AiModelConfig;
import org.dromara.ai.mapper.AiKnowledgeBaseMapper;
import org.dromara.ai.mapper.AiKnowledgeChunkMapper;
import org.dromara.ai.mapper.AiKnowledgeDocumentMapper;
import org.dromara.ai.mapper.AiModelConfigMapper;
import org.dromara.ai.service.IAiKnowledgeService;
import org.dromara.ai.util.VectorUtils;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.mybatis.core.page.PageQuery;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 知识库、切片与向量检索业务实现
 *
 * @author ruoyi
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiKnowledgeServiceImpl implements IAiKnowledgeService {

    private final AiKnowledgeBaseMapper baseMapper;
    private final AiKnowledgeDocumentMapper documentMapper;
    private final AiKnowledgeChunkMapper chunkMapper;
    private final AiModelConfigMapper modelConfigMapper;

    @Override
    public PageResult<AiKnowledgeBase> selectBaseList(AiKnowledgeBase base, PageQuery pageQuery) {
        LambdaQueryWrapper<AiKnowledgeBase> lqw = new LambdaQueryWrapper<>();
        if (base != null) {
            lqw.like(base.getName() != null && !base.getName().isBlank(), AiKnowledgeBase::getName, base.getName())
               .eq(base.getStatus() != null && !base.getStatus().isBlank(), AiKnowledgeBase::getStatus, base.getStatus());
        }
        lqw.orderByDesc(AiKnowledgeBase::getCreateTime);
        Page<AiKnowledgeBase> page = baseMapper.selectPage(pageQuery.build(), lqw);
        return PageResult.build(page.getRecords(), page.getTotal());
    }

    @Override
    public List<AiKnowledgeBase> selectBaseListAll() {
        return baseMapper.selectList(new LambdaQueryWrapper<AiKnowledgeBase>()
            .eq(AiKnowledgeBase::getStatus, "0")
            .orderByDesc(AiKnowledgeBase::getCreateTime));
    }

    @Override
    public AiKnowledgeBase selectBaseById(Long id) {
        return baseMapper.selectById(id);
    }

    @Override
    public boolean insertBase(AiKnowledgeBase base) {
        if (base.getChunkSize() == null || base.getChunkSize() <= 0) {
            base.setChunkSize(500);
        }
        if (base.getChunkOverlap() == null || base.getChunkOverlap() < 0) {
            base.setChunkOverlap(50);
        }
        if (base.getStatus() == null || base.getStatus().isBlank()) {
            base.setStatus("0");
        }
        if (base.getIsPublic() == null || base.getIsPublic().isBlank()) {
            base.setIsPublic("0");
        }
        return baseMapper.insert(base) > 0;
    }

    @Override
    public boolean updateBase(AiKnowledgeBase base) {
        return baseMapper.updateById(base) > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteBaseById(Long id) {
        // 级联清除切片与文档
        chunkMapper.delete(new LambdaQueryWrapper<AiKnowledgeChunk>().eq(AiKnowledgeChunk::getKbId, id));
        documentMapper.delete(new LambdaQueryWrapper<AiKnowledgeDocument>().eq(AiKnowledgeDocument::getKbId, id));
        return baseMapper.deleteById(id) > 0;
    }

    @Override
    public PageResult<AiKnowledgeDocument> selectDocumentList(Long kbId, PageQuery pageQuery) {
        LambdaQueryWrapper<AiKnowledgeDocument> lqw = new LambdaQueryWrapper<AiKnowledgeDocument>()
            .eq(AiKnowledgeDocument::getKbId, kbId)
            .orderByDesc(AiKnowledgeDocument::getCreateTime);
        Page<AiKnowledgeDocument> page = documentMapper.selectPage(pageQuery.build(), lqw);
        return PageResult.build(page.getRecords(), page.getTotal());
    }

    @Override
    public AiKnowledgeDocument selectDocumentById(Long id) {
        return documentMapper.selectById(id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteDocumentById(Long id) {
        chunkMapper.delete(new LambdaQueryWrapper<AiKnowledgeChunk>().eq(AiKnowledgeChunk::getDocId, id));
        return documentMapper.deleteById(id) > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int chunkAndSaveText(Long kbId, Long docId, String title, String content, Integer chunkSize, Integer chunkOverlap) {
        return chunkAndSaveText(kbId, docId, title, content, chunkSize, chunkOverlap, "text", null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int chunkAndSaveText(Long kbId, Long docId, String title, String content, Integer chunkSize, Integer chunkOverlap, String chunkType, String question) {
        if (content == null || content.isBlank()) {
            return 0;
        }

        // 1. 获取对应知识库设置
        AiKnowledgeBase kb = baseMapper.selectById(kbId);
        int size = (chunkSize != null && chunkSize > 0) ? chunkSize : (kb != null && kb.getChunkSize() != null ? kb.getChunkSize() : 500);
        int overlap = (chunkOverlap != null && chunkOverlap >= 0) ? chunkOverlap : (kb != null && kb.getChunkOverlap() != null ? kb.getChunkOverlap() : 50);
        if (overlap >= size) {
            overlap = size / 2;
        }

        // 2. 检查或生成文档载体
        AiKnowledgeDocument doc = null;
        if (docId != null && docId > 0) {
            doc = documentMapper.selectById(docId);
        }
        if (doc == null) {
            doc = new AiKnowledgeDocument();
            doc.setKbId(kbId);
            doc.setFileName(title != null && !title.isBlank() ? title : ("qa".equalsIgnoreCase(chunkType) ? "问答词条" : "文本切片") + "_" + System.currentTimeMillis());
            doc.setFilePath("inline");
            doc.setFileSize((long) content.length());
            doc.setFileType("qa".equalsIgnoreCase(chunkType) ? "qa" : "txt");
            doc.setParseStatus("1");
            doc.setChunkCount(0);
            doc.setCreateTime(LocalDateTime.now());
            doc.setUpdateTime(LocalDateTime.now());
            documentMapper.insert(doc);
            docId = doc.getId();
        }

        // 3. 查询 Embedding 模型配置
        AiModelConfig embConfig = null;
        if (kb != null && kb.getEmbeddingModelId() != null) {
            embConfig = modelConfigMapper.selectById(kb.getEmbeddingModelId());
        }
        if (embConfig == null) {
            embConfig = modelConfigMapper.selectOne(new LambdaQueryWrapper<AiModelConfig>()
                .eq(AiModelConfig::getModelType, "embedding")
                .eq(AiModelConfig::getStatus, "0")
                .last("LIMIT 1"));
        }

        // 4. 判断是否为 QA 问答词条类型：若为 qa，只对 question 进行向量化计算，content 作为解答
        if ("qa".equalsIgnoreCase(chunkType) && question != null && !question.isBlank()) {
            float[] embedding = VectorUtils.generateEmbedding(question.trim(), embConfig);
            String vectorStr = VectorUtils.toVectorString(embedding);

            AiKnowledgeChunk chunk = new AiKnowledgeChunk();
            chunk.setKbId(kbId);
            chunk.setDocId(docId);
            chunk.setChunkOrder(1);
            chunk.setContent(content.trim());
            chunk.setTokenCount(content.trim().length());
            chunk.setChunkType("qa");
            chunk.setQuestion(question.trim());
            chunk.setStatus("0");
            chunk.setCreateTime(LocalDateTime.now());

            chunkMapper.insertChunkWithVector(chunk, vectorStr);

            doc.setChunkCount(1);
            doc.setParseStatus("2");
            doc.setUpdateTime(LocalDateTime.now());
            documentMapper.updateById(doc);

            log.info("知识库 [kbId={}] 成功写入 QA 问答词条，Q: [{}], 向量化入库完成", kbId, question);
            return 1;
        }

        // 5. 普通长文本滑动窗口切片
        List<String> chunks = splitText(content, size, overlap);
        int order = 1;
        for (String chunkText : chunks) {
            float[] embedding = VectorUtils.generateEmbedding(chunkText, embConfig);
            String vectorStr = VectorUtils.toVectorString(embedding);

            AiKnowledgeChunk chunk = new AiKnowledgeChunk();
            chunk.setKbId(kbId);
            chunk.setDocId(docId);
            chunk.setChunkOrder(order++);
            chunk.setContent(chunkText);
            chunk.setTokenCount(chunkText.length());
            chunk.setChunkType("text");
            chunk.setStatus("0");
            chunk.setCreateTime(LocalDateTime.now());

            chunkMapper.insertChunkWithVector(chunk, vectorStr);
        }

        doc.setChunkCount(chunks.size());
        doc.setParseStatus("2");
        doc.setUpdateTime(LocalDateTime.now());
        documentMapper.updateById(doc);

        log.info("知识库 [kbId={}] 成功写入 {} 个切片并完成 pgvector 向量化入库", kbId, chunks.size());
        return chunks.size();
    }

    @Override
    public PageResult<AiKnowledgeChunk> selectChunkList(Long kbId, Long docId, PageQuery pageQuery) {
        LambdaQueryWrapper<AiKnowledgeChunk> lqw = new LambdaQueryWrapper<AiKnowledgeChunk>()
            .eq(AiKnowledgeChunk::getKbId, kbId)
            .eq(docId != null && docId > 0, AiKnowledgeChunk::getDocId, docId)
            .orderByAsc(AiKnowledgeChunk::getChunkOrder)
            .orderByAsc(AiKnowledgeChunk::getId);
        Page<AiKnowledgeChunk> page = chunkMapper.selectPage(pageQuery.build(), lqw);
        return PageResult.build(page.getRecords(), page.getTotal());
    }

    @Override
    public boolean deleteChunkById(Long id) {
        return chunkMapper.deleteById(id) > 0;
    }

    @Override
    public List<AiKnowledgeChunk> searchChunks(Long kbId, String query, Integer topK, Double minScore) {
        if (query == null || query.isBlank()) {
            return List.of();
        }

        int k = (topK != null && topK > 0) ? topK : 5;
        double threshold = (minScore != null && minScore > 0) ? minScore : 0.0;

        // 1. 获取 Embedding 模型配置
        AiKnowledgeBase kb = baseMapper.selectById(kbId);
        AiModelConfig embConfig = null;
        if (kb != null && kb.getEmbeddingModelId() != null) {
            embConfig = modelConfigMapper.selectById(kb.getEmbeddingModelId());
        }
        if (embConfig == null) {
            embConfig = modelConfigMapper.selectOne(new LambdaQueryWrapper<AiModelConfig>()
                .eq(AiModelConfig::getModelType, "embedding")
                .eq(AiModelConfig::getStatus, "0")
                .last("LIMIT 1"));
        }

        // 2. 第一路：pgvector HNSW 余弦相似度语义检索 (对 QA 词条的 Q 具有极高的召回率)
        float[] queryEmbedding = VectorUtils.generateEmbedding(query, embConfig);
        String queryVectorStr = VectorUtils.toVectorString(queryEmbedding);
        List<AiKnowledgeChunk> results = chunkMapper.searchVectorChunks(kbId, queryVectorStr, k * 2);

        // 3. 第二路：提取关键词进行混合精准与模糊搜索，并做得分加权融合 (Hybrid Fusion)
        String cleanKw = query.replaceAll("[？?，,。!！吗呢的是我你可以多少帮查一下请问关于]", " ").trim();
        String[] keywords = cleanKw.split("\\s+");
        for (String kw : keywords) {
            if (kw.length() >= 2) {
                List<AiKnowledgeChunk> kwMatches = chunkMapper.searchKeywordChunks(kbId, kw, k);
                for (AiKnowledgeChunk km : kwMatches) {
                    AiKnowledgeChunk exist = results.stream().filter(r -> r.getId().equals(km.getId())).findFirst().orElse(null);
                    if (exist != null) {
                        // 命中关键词，将向量原分叠加加权 (+0.45)，使其轻松突破 0.8+
                        double boostScore = Math.min(1.0, (exist.getScore() != null ? exist.getScore() : 0.3) + 0.45);
                        exist.setScore(Math.round(boostScore * 10000.0) / 10000.0);
                    } else {
                        // 未在向量池中但命中关键词，直接作为高质量结果入库并赋分 0.85
                        km.setScore(0.8500);
                        results.add(km);
                    }
                }
            }
        }

        // 4. 按综合得分降序排列
        results.sort((a, b) -> Double.compare(b.getScore() != null ? b.getScore() : 0.0, a.getScore() != null ? a.getScore() : 0.0));

        // 5. 按相似度门槛过滤并截取 topK
        List<AiKnowledgeChunk> finalResults = new ArrayList<>();
        for (AiKnowledgeChunk c : results) {
            if (threshold <= 0.0 || (c.getScore() != null && c.getScore() >= threshold)) {
                finalResults.add(c);
                if (finalResults.size() >= k) {
                    break;
                }
            }
        }

        return finalResults;
    }

    /**
     * 滑动窗口断句切片
     */
    private List<String> splitText(String text, int size, int overlap) {
        List<String> result = new ArrayList<>();
        int length = text.length();
        int start = 0;

        while (start < length) {
            int end = Math.min(start + size, length);
            if (end < length) {
                // 尝试在重叠区寻找标点断句
                int lookback = Math.max(start, end - overlap);
                int sentenceBreak = -1;
                for (int i = end; i >= lookback; i--) {
                    char c = text.charAt(i - 1);
                    if (c == '\n' || c == '。' || c == '！' || c == '？' || c == ';' || c == '；') {
                        sentenceBreak = i;
                        break;
                    }
                }
                if (sentenceBreak > start) {
                    end = sentenceBreak;
                }
            }

            String chunk = text.substring(start, end).trim();
            if (!chunk.isBlank()) {
                result.add(chunk);
            }

            if (end >= length) {
                break;
            }
            start = Math.max(start + 1, end - overlap);
        }

        return result;
    }
}
