/**
 * 英文地名 → 中文地名映射表（离线，零外部依赖）。
 *
 * 背景：ip-api.com 是免费 IP 库里唯一直接返回中文省市的源，但它只支持 IPv4。
 * IPv6 访客只能落到 ipinfo.io / api.ip.sb，而这两者对中国的城市名一律返回拼音
 * （实测同一 IPv6：ipinfo 给 "Shanghai"，ip.sb 给 "Wuxi"，精度也不一致）。
 * 下游腾讯天气城市库只认中文城市名，于是拼音名检索失败、一路回退默认城市。
 *
 * 可用的免费 IPv6 中文库实测均不可用（百度 qifu-api 已下线 404、api.vore.top 与
 * ipapi.co 被 Cloudflare 拦 403、ip.useragentinfo.com 连接失败），因此内置本表，
 * 在 IP 库结果返回后做一次归一化：英文城市名 → 中文城市名，命中不了则退到省会。
 * 注意腾讯城市库既不接受省级名称（"江苏" 404），也不接受带「市」的城市名
 * （"无锡市" 404），所以这里输出的必须是「无锡」这种形式。
 *
 * 规范：ipinfo 与 ip.sb 的拼写不一致（"Xi'an" / "Xian"、"Lvliang" / "Luliang"），
 * 所有键在写入与查询时都经 normalizeGeoName() 归一（小写、去掉非字母字符），
 * 因此这里直接写最自然的拼写即可。
 */

/** 归一名地名字符串：ipinfo 的 "Xi'an"、ip.sb 的 "Xian" 归一后都是 "xian" */
export function normalizeGeoName(value: string | undefined | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

/**
 * 省级：英文省名 → 中文省名。
 * ipinfo 的 region 对中国大陆给拼音（Jiangsu / Inner Mongolia / Xizang），
 * api.ip.sb 同样是英文。用于「城市命中不了时退到省会」的中间步骤。
 */
export const CN_PROVINCE: Record<string, string> = {
  beijing: '北京',
  tianjin: '天津',
  shanghai: '上海',
  chongqing: '重庆',
  hebei: '河北',
  shanxi: '山西',
  liaoning: '辽宁',
  jilin: '吉林',
  heilongjiang: '黑龙江',
  jiangsu: '江苏',
  zhejiang: '浙江',
  anhui: '安徽',
  fujian: '福建',
  jiangxi: '江西',
  shandong: '山东',
  henan: '河南',
  hubei: '湖北',
  hunan: '湖南',
  guangdong: '广东',
  guangxi: '广西',
  hainan: '海南',
  sichuan: '四川',
  guizhou: '贵州',
  yunnan: '云南',
  xizang: '西藏',
  tibet: '西藏',
  shaanxi: '陕西',
  gansu: '甘肃',
  qinghai: '青海',
  ningxia: '宁夏',
  xinjiang: '新疆',
  innermongolia: '内蒙古',
  neimenggu: '内蒙古',
  hongkong: '香港',
  macau: '澳门',
  taiwan: '台湾',
}

/**
 * 省会 / 直辖市：中文省名 → 城市名（腾讯城市库能识别的形式，不带「市」）。
 * 腾讯不接受省级名称，城市名又映射不出来时，退到省会仍比回退默认城市合理。
 */
export const CN_CAPITAL: Record<string, string> = {
  北京: '北京',
  天津: '天津',
  上海: '上海',
  重庆: '重庆',
  河北: '石家庄',
  山西: '太原',
  辽宁: '沈阳',
  吉林: '长春',
  黑龙江: '哈尔滨',
  江苏: '南京',
  浙江: '杭州',
  安徽: '合肥',
  福建: '福州',
  江西: '南昌',
  山东: '济南',
  河南: '郑州',
  湖北: '武汉',
  湖南: '长沙',
  广东: '广州',
  广西: '南宁',
  海南: '海口',
  四川: '成都',
  贵州: '贵阳',
  云南: '昆明',
  西藏: '拉萨',
  陕西: '西安',
  甘肃: '兰州',
  青海: '西宁',
  宁夏: '银川',
  新疆: '乌鲁木齐',
  内蒙古: '呼和浩特',
  香港: '香港',
  澳门: '澳门',
  台湾: '台北',
}

/**
 * 市级：'省|市' → 中文城市名，键一律经 normalizeGeoName() 处理。
 * 用「省|市」组合键是为了消除拼音重名：Suzhou 在江苏是苏州、在安徽是宿州；
 * Fuzhou 在福建是福州、在江西是抚州；Taizhou 在江苏是泰州、在浙江是台州；
 * Yulin 在陕西是榆林、在广西是玉林；Yichun 在江西是宜春、在黑龙江是伊春。
 * 覆盖全部地级行政区（不含省直辖县级市，未命中会退到省会）。
 */
export const CN_CITY: Record<string, string> = {
  // ---- 直辖市 ----
  'beijing|beijing': '北京',
  'tianjin|tianjin': '天津',
  'shanghai|shanghai': '上海',
  'chongqing|chongqing': '重庆',

  // ---- 河北 ----
  'hebei|shijiazhuang': '石家庄',
  'hebei|tangshan': '唐山',
  'hebei|qinhuangdao': '秦皇岛',
  'hebei|handan': '邯郸',
  'hebei|xingtai': '邢台',
  'hebei|baoding': '保定',
  'hebei|zhangjiakou': '张家口',
  'hebei|chengde': '承德',
  'hebei|cangzhou': '沧州',
  'hebei|langfang': '廊坊',
  'hebei|hengshui': '衡水',

  // ---- 山西 ----
  'shanxi|taiyuan': '太原',
  'shanxi|datong': '大同',
  'shanxi|yangquan': '阳泉',
  'shanxi|changzhi': '长治',
  'shanxi|jincheng': '晋城',
  'shanxi|shuozhou': '朔州',
  'shanxi|jinzhong': '晋中',
  'shanxi|yuncheng': '运城',
  'shanxi|xinzhou': '忻州',
  'shanxi|linfen': '临汾',
  'shanxi|lvliang': '吕梁',
  'shanxi|luliang': '吕梁',

  // ---- 辽宁 ----
  'liaoning|shenyang': '沈阳',
  'liaoning|dalian': '大连',
  'liaoning|anshan': '鞍山',
  'liaoning|fushun': '抚顺',
  'liaoning|benxi': '本溪',
  'liaoning|dandong': '丹东',
  'liaoning|jinzhou': '锦州',
  'liaoning|yingkou': '营口',
  'liaoning|fuxin': '阜新',
  'liaoning|liaoyang': '辽阳',
  'liaoning|panjin': '盘锦',
  'liaoning|tieling': '铁岭',
  'liaoning|chaoyang': '朝阳',
  'liaoning|huludao': '葫芦岛',

  // ---- 吉林 ----
  'jilin|changchun': '长春',
  'jilin|jilin': '吉林',
  'jilin|siping': '四平',
  'jilin|liaoyuan': '辽源',
  'jilin|tonghua': '通化',
  'jilin|baishan': '白山',
  'jilin|songyuan': '松原',
  'jilin|baicheng': '白城',
  'jilin|yanbian': '延吉',

  // ---- 黑龙江 ----
  'heilongjiang|harbin': '哈尔滨',
  'heilongjiang|qiqihar': '齐齐哈尔',
  'heilongjiang|jixi': '鸡西',
  'heilongjiang|hegang': '鹤岗',
  'heilongjiang|shuangyashan': '双鸭山',
  'heilongjiang|daqing': '大庆',
  'heilongjiang|yichun': '伊春',
  'heilongjiang|jiamusi': '佳木斯',
  'heilongjiang|qitaihe': '七台河',
  'heilongjiang|mudanjiang': '牡丹江',
  'heilongjiang|heihe': '黑河',
  'heilongjiang|suihua': '绥化',

  // ---- 江苏 ----
  'jiangsu|nanjing': '南京',
  'jiangsu|wuxi': '无锡',
  'jiangsu|xuzhou': '徐州',
  'jiangsu|changzhou': '常州',
  'jiangsu|suzhou': '苏州',
  'jiangsu|nantong': '南通',
  'jiangsu|lianyungang': '连云港',
  'jiangsu|huaian': '淮安',
  'jiangsu|yancheng': '盐城',
  'jiangsu|yangzhou': '扬州',
  'jiangsu|zhenjiang': '镇江',
  'jiangsu|taizhou': '泰州',
  'jiangsu|suqian': '宿迁',

  // ---- 浙江 ----
  'zhejiang|hangzhou': '杭州',
  'zhejiang|ningbo': '宁波',
  'zhejiang|wenzhou': '温州',
  'zhejiang|jiaxing': '嘉兴',
  'zhejiang|huzhou': '湖州',
  'zhejiang|shaoxing': '绍兴',
  'zhejiang|jinhua': '金华',
  'zhejiang|quzhou': '衢州',
  'zhejiang|zhoushan': '舟山',
  'zhejiang|taizhou': '台州',
  'zhejiang|lishui': '丽水',

  // ---- 安徽 ----
  'anhui|hefei': '合肥',
  'anhui|wuhu': '芜湖',
  'anhui|bengbu': '蚌埠',
  'anhui|huainan': '淮南',
  'anhui|maanshan': '马鞍山',
  'anhui|huaibei': '淮北',
  'anhui|tongling': '铜陵',
  'anhui|anqing': '安庆',
  'anhui|huangshan': '黄山',
  'anhui|chuzhou': '滁州',
  'anhui|fuyang': '阜阳',
  'anhui|suzhou': '宿州',
  'anhui|luan': '六安',
  'anhui|bozhou': '亳州',
  'anhui|chizhou': '池州',
  'anhui|xuancheng': '宣城',

  // ---- 福建 ----
  'fujian|fuzhou': '福州',
  'fujian|xiamen': '厦门',
  'fujian|putian': '莆田',
  'fujian|sanming': '三明',
  'fujian|quanzhou': '泉州',
  'fujian|zhangzhou': '漳州',
  'fujian|nanping': '南平',
  'fujian|longyan': '龙岩',
  'fujian|ningde': '宁德',

  // ---- 江西 ----
  'jiangxi|nanchang': '南昌',
  'jiangxi|jingdezhen': '景德镇',
  'jiangxi|pingxiang': '萍乡',
  'jiangxi|jiujiang': '九江',
  'jiangxi|xinyu': '新余',
  'jiangxi|yingtan': '鹰潭',
  'jiangxi|ganzhou': '赣州',
  'jiangxi|jian': '吉安',
  'jiangxi|yichun': '宜春',
  'jiangxi|fuzhou': '抚州',
  'jiangxi|shangrao': '上饶',

  // ---- 山东 ----
  'shandong|jinan': '济南',
  'shandong|qingdao': '青岛',
  'shandong|zibo': '淄博',
  'shandong|zaozhuang': '枣庄',
  'shandong|dongying': '东营',
  'shandong|yantai': '烟台',
  'shandong|weifang': '潍坊',
  'shandong|jining': '济宁',
  'shandong|taian': '泰安',
  'shandong|weihai': '威海',
  'shandong|rizhao': '日照',
  'shandong|linyi': '临沂',
  'shandong|dezhou': '德州',
  'shandong|liaocheng': '聊城',
  'shandong|binzhou': '滨州',
  'shandong|heze': '菏泽',

  // ---- 河南 ----
  'henan|zhengzhou': '郑州',
  'henan|kaifeng': '开封',
  'henan|luoyang': '洛阳',
  'henan|pingdingshan': '平顶山',
  'henan|anyang': '安阳',
  'henan|hebi': '鹤壁',
  'henan|xinxiang': '新乡',
  'henan|jiaozuo': '焦作',
  'henan|puyang': '濮阳',
  'henan|xuchang': '许昌',
  'henan|luohe': '漯河',
  'henan|sanmenxia': '三门峡',
  'henan|nanyang': '南阳',
  'henan|shangqiu': '商丘',
  'henan|xinyang': '信阳',
  'henan|zhoukou': '周口',
  'henan|zhumadian': '驻马店',
  'henan|jiyuan': '济源',

  // ---- 湖北 ----
  'hubei|wuhan': '武汉',
  'hubei|huangshi': '黄石',
  'hubei|shiyan': '十堰',
  'hubei|yichang': '宜昌',
  'hubei|xiangyang': '襄阳',
  'hubei|ezhou': '鄂州',
  'hubei|jingmen': '荆门',
  'hubei|xiaogan': '孝感',
  'hubei|jingzhou': '荆州',
  'hubei|huanggang': '黄冈',
  'hubei|xianning': '咸宁',
  'hubei|suizhou': '随州',
  'hubei|enshi': '恩施',

  // ---- 湖南 ----
  'hunan|changsha': '长沙',
  'hunan|zhuzhou': '株洲',
  'hunan|xiangtan': '湘潭',
  'hunan|hengyang': '衡阳',
  'hunan|shaoyang': '邵阳',
  'hunan|yueyang': '岳阳',
  'hunan|changde': '常德',
  'hunan|zhangjiajie': '张家界',
  'hunan|yiyang': '益阳',
  'hunan|chenzhou': '郴州',
  'hunan|yongzhou': '永州',
  'hunan|huaihua': '怀化',
  'hunan|loudi': '娄底',
  'hunan|xiangxi': '吉首',

  // ---- 广东 ----
  'guangdong|guangzhou': '广州',
  'guangdong|shaoguan': '韶关',
  'guangdong|shenzhen': '深圳',
  'guangdong|zhuhai': '珠海',
  'guangdong|shantou': '汕头',
  'guangdong|foshan': '佛山',
  'guangdong|jiangmen': '江门',
  'guangdong|zhanjiang': '湛江',
  'guangdong|maoming': '茂名',
  'guangdong|zhaoqing': '肇庆',
  'guangdong|huizhou': '惠州',
  'guangdong|meizhou': '梅州',
  'guangdong|shanwei': '汕尾',
  'guangdong|heyuan': '河源',
  'guangdong|yangjiang': '阳江',
  'guangdong|qingyuan': '清远',
  'guangdong|dongguan': '东莞',
  'guangdong|zhongshan': '中山',
  'guangdong|chaozhou': '潮州',
  'guangdong|jieyang': '揭阳',
  'guangdong|yunfu': '云浮',

  // ---- 广西 ----
  'guangxi|nanning': '南宁',
  'guangxi|liuzhou': '柳州',
  'guangxi|guilin': '桂林',
  'guangxi|wuzhou': '梧州',
  'guangxi|beihai': '北海',
  'guangxi|fangchenggang': '防城港',
  'guangxi|qinzhou': '钦州',
  'guangxi|guigang': '贵港',
  'guangxi|yulin': '玉林',
  'guangxi|baise': '百色',
  'guangxi|hezhou': '贺州',
  'guangxi|hechi': '河池',
  'guangxi|laibin': '来宾',
  'guangxi|chongzuo': '崇左',

  // ---- 海南 ----
  'hainan|haikou': '海口',
  'hainan|sanya': '三亚',
  'hainan|sansha': '三沙',
  'hainan|danzhou': '儋州',

  // ---- 四川 ----
  'sichuan|chengdu': '成都',
  'sichuan|zigong': '自贡',
  'sichuan|panzhihua': '攀枝花',
  'sichuan|luzhou': '泸州',
  'sichuan|deyang': '德阳',
  'sichuan|mianyang': '绵阳',
  'sichuan|guangyuan': '广元',
  'sichuan|suining': '遂宁',
  'sichuan|neijiang': '内江',
  'sichuan|leshan': '乐山',
  'sichuan|nanchong': '南充',
  'sichuan|meishan': '眉山',
  'sichuan|yibin': '宜宾',
  'sichuan|guangan': '广安',
  'sichuan|dazhou': '达州',
  'sichuan|yaan': '雅安',
  'sichuan|bazhong': '巴中',
  'sichuan|ziyang': '资阳',
  'sichuan|liangshan': '西昌',

  // ---- 贵州 ----
  'guizhou|guiyang': '贵阳',
  'guizhou|liupanshui': '六盘水',
  'guizhou|zunyi': '遵义',
  'guizhou|anshun': '安顺',
  'guizhou|bijie': '毕节',
  'guizhou|tongren': '铜仁',

  // ---- 云南 ----
  'yunnan|kunming': '昆明',
  'yunnan|qujing': '曲靖',
  'yunnan|yuxi': '玉溪',
  'yunnan|baoshan': '保山',
  'yunnan|zhaotong': '昭通',
  'yunnan|lijiang': '丽江',
  'yunnan|puer': '普洱',
  'yunnan|lincang': '临沧',

  // ---- 西藏 ----
  'xizang|lhasa': '拉萨',
  'xizang|shigatse': '日喀则',
  'xizang|xigaze': '日喀则',
  'tibet|lhasa': '拉萨',

  // ---- 陕西 ----
  'shaanxi|xian': '西安',
  'shaanxi|tongchuan': '铜川',
  'shaanxi|baoji': '宝鸡',
  'shaanxi|xianyang': '咸阳',
  'shaanxi|weinan': '渭南',
  'shaanxi|yanan': '延安',
  'shaanxi|hanzhong': '汉中',
  'shaanxi|yulin': '榆林',
  'shaanxi|ankang': '安康',
  'shaanxi|shangluo': '商洛',

  // ---- 甘肃 ----
  'gansu|lanzhou': '兰州',
  'gansu|jiayuguan': '嘉峪关',
  'gansu|jinchang': '金昌',
  'gansu|baiyin': '白银',
  'gansu|tianshui': '天水',
  'gansu|wuwei': '武威',
  'gansu|zhangye': '张掖',
  'gansu|pingliang': '平凉',
  'gansu|jiuquan': '酒泉',
  'gansu|qingyang': '庆阳',
  'gansu|dingxi': '定西',
  'gansu|longnan': '陇南',

  // ---- 青海 ----
  'qinghai|xining': '西宁',
  'qinghai|haidong': '海东',

  // ---- 宁夏 ----
  'ningxia|yinchuan': '银川',
  'ningxia|shizuishan': '石嘴山',
  'ningxia|wuzhong': '吴忠',
  'ningxia|guyuan': '固原',
  'ningxia|zhongwei': '中卫',

  // ---- 新疆 ----
  'xinjiang|urumqi': '乌鲁木齐',
  'xinjiang|karamay': '克拉玛依',
  'xinjiang|turpan': '吐鲁番',
  'xinjiang|hami': '哈密',

  // ---- 内蒙古 ----
  'innermongolia|hohhot': '呼和浩特',
  'innermongolia|baotou': '包头',
  'innermongolia|wuhai': '乌海',
  'innermongolia|chifeng': '赤峰',
  'innermongolia|tongliao': '通辽',
  'innermongolia|ordos': '鄂尔多斯',
  'innermongolia|hulunbuir': '呼伦贝尔',
  'innermongolia|bayannur': '巴彦淖尔',
  'innermongolia|ulanqab': '乌兰察布',
  'neimenggu|hohhot': '呼和浩特',
  'neimenggu|baotou': '包头',

  // ---- 港澳台 ----
  'hongkong|hongkong': '香港',
  'macau|macau': '澳门',
  'taiwan|taipei': '台北',
}

/** 行政区划名本身已完整、不该再追加「省」的省级单位（直辖市 / 自治区 / 特别行政区） */
const NO_PROVINCE_SUFFIX = new Set([
  '北京',
  '天津',
  '上海',
  '重庆',
  '内蒙古',
  '广西',
  '西藏',
  '宁夏',
  '新疆',
  '香港',
  '澳门',
  '台湾',
])

/**
 * 把 IP 库返回的英文省市归一化成腾讯城市库能识别的中文城市名。
 * 优先级：省|市 精确匹配 → 省名映射后取省会 → 都不是则返回空串（交由调用方兜底）。
 * 传进来的值若已经是中文（走了 ip-api.com 的 IPv4 路径）会原样返回。
 */
export function toChineseCity(province: string, city: string): { province: string; city: string } {
  // 已经是中文就不动：ip-api.com 返回的就是中文，无需映射
  const hasHan = (s: string) => /[\u4e00-\u9fa5]/.test(s)
  if (hasHan(city) || hasHan(province)) return { province, city }

  const p = normalizeGeoName(province)
  const c = normalizeGeoName(city)

  const provCn = CN_PROVINCE[p] || ''
  const provFull = provCn ? (NO_PROVINCE_SUFFIX.has(provCn) ? provCn : `${provCn}省`) : ''

  // 先按「省|市」精确匹配，消掉 Suzhou / Fuzhou / Taizhou / Yulin / Yichun 这类拼音重名
  if (provCn && c) {
    const hit = CN_CITY[`${p}|${c}`]
    if (hit) return { province: provFull, city: hit }
  }

  // 省市都没命中时，退到省会：腾讯城市库不接受省级名称，省会仍好过默认城市
  const capital = CN_CAPITAL[provCn]
  if (capital) return { province: provFull, city: capital }

  return { province: '', city: '' }
}
