import data
import copy

# convo 220862637.3220.3220 from conversations-gone-awry-corpus
convo_1 = [{'id': '220862637.3220.3220',
           'timestamp': 1214109662.0,
            'score': 0.36862877011299133,
            'text': '== June 2008 ==',
            'author': 'Tasc0' },
           {'id': '220862637.3230.3220',
           'timestamp': 1214091662.0,
            'score': 0.29041874408721924,
            'text': "Please don't add spam links as you did to the articles wiki_link and wiki_link. Thank you. external_link, external_link.",
            'author': 'Tasc0' },
           {'id': '220919311.3303.3303',
           'timestamp': 1214114142.0,
            'score': 0.2623189091682434,
            'text': 'okay, whatever you say, but their werent "Spam" links, okay Tasc0, they were links to youtube, it wasnt spam.  June 2008 (UTC)',
           'author': 'ImNotRichImStillLyin' },
           {'id': '221039185.3359.3359',
           'timestamp': 1214164854.0,
            'score': 0.18399234116077423,
            'text': "They are considered as spam.",
            'author': 'Tasc0' },
           {'id': '226034647.3371.3371',
           'timestamp': 1216221265.0,
            'score': 0.7785950303077698,
            'text': 'Man go bother some one else. :::You know what fuck u Ass0 get the fuck off my back.',
            'author': 'ImNotRichImStillLyin' }
]

# convo 144643838.1236.1236 from conversations-gone-awry-corpus
convo_2 = [{'id': '144643838.1236.1236',
           'timestamp': 1184456740.0,
            'score': 0.3843662142753601,
            'text': '==Regarding edits to [WIKI_LINK: Talk:George W. Bush]==',
            'author': 'AuburnPilot' },
           {'id': '144643838.1260.1236',
           'timestamp': 1184438740.0,
            'score': 0.3485105633735657,
            'text': "Please stop removing and altering other editors' comments. What appeared to be valid concern is quickly descending into trolling, and if you continue, you may be blocked from editing. Stop it. - ",
            'author': 'AuburnPilot' },
           {'id': '144644837.1330.1330',
           'timestamp': 1184439120.0,
            'score': 0.7159856557846069,
            'text': " Well please stop posting incorrect information. If you were right I'd agree with you, and I am NOT trolling. ",
            'author': 'Billzilla' },
           {'id': '144645147.1375.1330',
           'timestamp': 1184439240.0,
            'score': 0.9591325521469116,
            'text': "external_link is trolling, as is removing other people's comments. Look, Wikipedia is built on consensus, and consensus has it that we use American style for American subjects. End of story. Any more complaint about trolling about this topic and I'll report you myself.",
            'author': 'The Evil Spartan' } #,
           # {'id': '144645449.1479.1479',
           # 'timestamp': 1184439358.0,
           #  'score': 0.7235555052757263,
           #  'text': "Bullshit. I am correcting a simple mistake. If I was trolling I'd be doing damage to the page, yet I  am not. What was written is wrong, simple as that. All I have done is disagree with what was written and written as such. If that's trolling then you are guilty as well. And stop unediting MY page dickhead. Billzilla.",
           #  'author': 'Billzilla' }
]

# convo  from conversations-gone-awry-corpus
convo_3 = [{'id': '271340377.69106.69106',
           'timestamp': 1234897606.0,
            'score': 0.332960307598114,
            'text': '== Honors section ==',
            'author': 'Skomorokh' },
           {'id': '271340377.69116.69106',
           'timestamp': 1234879606.0,
            'score': 0.1754651665687561,
            'text': 'This section is a mere three lines long. Would anyone object to integrating it into the biographical sections of the article?',
            'author': 'Skomorokh' }, 
           {'id': '271369262.70124.70124',
           'timestamp': 1234889767.0,
            'score': 0.16323791444301605,
            'text': ' Sounds good. ',
            'author': 'SteveWolfer' },
           {'id': '271372051.70131.70131',
           'timestamp': 1234890686.0,
            'score': 0.10327339917421341,
            'text': 'Yeah, I moved it to its own section because it was part of the "Early Life" section (!). Feel free to integrate it elsewhere.',
            'author': '134.173.61.53' },
           {'id': '271737366.70124.2298',
           'timestamp': 1235013996.0,
            'score': 0.16323791444301605,
            'text': 'Sounds good.',
            'author': 'TallNapoleon' }
]

wiki_convo_data = { 'convo 1': # convo 1 -> does derail
                    {'utt_id': 'convo 1',
                     'parent': None,
                     'convo': convo_1,
                     'convo_name': convo_1[0]['text'],
                     'permalink': None},
                    
                    'convo 2': # convo 2 -> does derail, cut off beforehand
                    {'utt_id': 'convo 2',
                     'parent': None,
                     'convo': convo_2,
                     'convo_name': convo_2[0]['text'],
                     'permalink': None},
                    
                    'convo 3': # convo 3 -> does not derail
                    {'utt_id': 'convo 3',
                     'parent': None,
                     'convo': convo_3,
                     'convo_name': convo_3[0]['text'],
                     'permalink': None}
}

def wiki_get_convo(topic, utt_id):
    assert utt_id in data.wiki_mockup_convos
    return copy.deepcopy(wiki_convo_data[utt_id])
