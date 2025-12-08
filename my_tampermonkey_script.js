// ==UserScript==
// @name         Online Test Pad Helper
// @namespace    https://onlinetestpad.com/
// @version      2025-11-24
// @description  try to take over the world!
// @author       You
// @match        https://*onlinetestpad.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

//const db_type = "supabase";
const db_type = "render_flask";
function objectToStringWithSeparator(
	obj,
	pairSeparator = ",",
	keyValueSeparator = ":"
) {
	return Object.entries(obj)
		.map(([key, value]) => `${key}${keyValueSeparator}${value}`)
		.join(pairSeparator);
}

const oth_form_data = {
	user_data: {},
	question_data: {},
	answers_data: {},
	test_data: {},

	question_variants: null,
	best_user_answer_element: null,
	el_answer_text: null,
	question_type: null
}

const AIRequestTextCommonStart = "Отвечай на русском языке. Не используй спец символы по типу * и # для выделения текста. Не надо объяснений, пояснений и своих размышлений. ";

const question_types = {
	1: {
		name: "одиночный выбор",
		work_with_db: true,
		getAITextRequest: (question_string, question_variants) => {
			return `Ответь на следующий вопрос: ${question_string}. Выбери 1 вариант ответа из следующих вопросов: ${question_variants.join(
				"; "
			)}.`
		}
	},
	2: {
		name: "множественный выбор",
		work_with_db: true,
		getAITextRequest: (question_string, question_variants) => {
			return `Ответь на следующий вопрос: ${question_string}. Выбери 1 или несколько вариантов ответа из следующих вопросов: ${question_variants.join(
				"; "
			)}. Ответы пиши через точку с запятой.`
		}
	},
	3: {
		name: "поле ввода",
		work_with_db: true,
		getAITextRequest: (question_string, question_variants) => {
			return `Ответь на следующий вопрос: ${question_string}.`
		}
	},
	4: {
		name: "слайдер",
		work_with_db: true,
		getAITextRequest: (question_string, question_variants) => {
			return `Ответь на следующий вопрос: ${question_string}. В ответе должно быть число от ${question_variants[0]} до ${question_variants[1]}.`
		}
	},
	5: {
		name: "сопоставление",
		getAITextRequest: (question_string, question_variants) => {
			return `Ответь на следующий вопрос: ${question_string}. Сопоставь следующие варианты ответа перечисленные точкой с запятой: ${question_variants[0].join(";")}. С этими вариантами ответов перечисленные через точку с запятой: ${question_variants[1].join(";")}. Не надо объяснений и пояснений.`
		}
	},
	6: {
		name: "пропуски",
		getAITextRequest: (question_string, question_variants) => {
			const skipsText = getSkipsText()
			let req = `подставь вместо пропусков, которые выглядят так {txt}, текст: ${skipsText.text}. Варианты ответа разделены "," а варианты ответов к пропускам разделяются ";". Не надо объяснений и пояснений. `;
			
			skipsText.variants.forEach((variant, index) => {
				req += `${variant.join(", ")}${skipsText.length - 1 === index ? "." : ";"}`;
			});
			return req.trim()
		}
	},
	7: {
		name: "Правильная последовательность",
		getAITextRequest: (question_string, question_variants) => {
			return `Посмотри на следующий вопрос: ${question_string}. Основываясь на этом вопросе сопоставь следующие варианты в правильном порядке, варианты разделены ";": ${question_variants.join("; ")}`;
		}
	}
}

const aiModels = [
	{
		modelName: "gemini-2.5-flash",
		modelNameUser: "gemini 2.5 flash",
		textElement: null,
		api_key: window.googleai_api_key,
		type: "googleai",
	},
	{
		url: "https://router.huggingface.co/v1/chat/completions",
		api_key: window.hf_api_key,
		modelName: "Qwen/Qwen3-4B-Instruct-2507:nscale",
		modelNameUser: "Qwen3 4B Instruct 2507",
		textElement: null,
	},
	/*{
		url: "https://router.huggingface.co/v1/chat/completions",
		api_key: window.hf_api_key,
		modelName: "zai-org/GLM-4.6:novita",
		modelNameUser: "Z.AI GLM-4.6 HF",
		textElement: null,
	},*/
	/*{
		url: "https://router.huggingface.co/v1/chat/completions",
		api_key: window.hf_api_key,
		modelName: "meta-llama/Llama-3.1-8B-Instruct:novita",
		modelNameUser: "Llama 3.1 8B",
		textElement: null,
	},*/
	{
		url: "https://router.huggingface.co/v1/chat/completions",
		api_key: window.hf_api_key,
		modelName: "moonshotai/Kimi-K2-Thinking:novita",
		modelNameUser: "Kimi-K2",
		textElement: null,
	},
	{
		url: "https://router.huggingface.co/v1/chat/completions",
		api_key: window.hf_api_key,
		modelName: "deepseek-ai/DeepSeek-V3.2-Exp:novita",
		modelNameUser: "DeepSeek V3.2 Exp HF",
		textElement: null,
	},
];

function getChildWhere(main_element, condition) {
	for (let el of main_element.childNodes) {
		if (condition(el)) {
			return el;
		}
	}
	return null;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('Не удалось скопировать текст: ', err);
  }
}


function getChildrenWhere(main_element, condition) {
	for (let el of main_element.childNodes) {
		if (condition(el)) {
			return el;
		}
	}
	return null;
}

function isMatchingId(el, idname) {
	return el.id && el.id.toLowerCase() == idname;
}

function isMatchingTagName(el, tagname) {
	return el.tagName && el.tagName.toLowerCase() === tagname;
}

function getQuestionElement() {
	const slider_container = document.querySelector("#d-q-ans-container > div.slider-container > div.item")

	if (slider_container)
		return slider_container;


	const view_page = document.querySelector("#testform > *.otp-item-view-page");
	if (view_page === null) return null;

	const view_page_div = getChildWhere(
		view_page,
		(el) => el.className == "" || el.className === null
	);
	if (view_page_div === null) return null;

	const view_question = getChildWhere(
		view_page_div,
		(el) => el.id && el.id.match(/dq_\d*/)
	);
	if (view_question === null) return null;

	const qcontainer = getChildWhere(
		view_question,
		(el) => el.className && el.className.match(/qcontainer\s*/)
	);
	if (qcontainer === null) return view_question;


	const qcontainer_div = getChildWhere(
		qcontainer,
		(el) => isMatchingTagName(el, "div") && !(el.className || el.id)
	);
	if (qcontainer_div === null) return view_question;

	const qtext = getChildWhere(
		qcontainer_div,
		(el) => el.className === "qtext"
	);
	return qtext ?? qcontainer_div
}

function getQuestionStrings() {
	const fillinblank_contrainer = document.querySelectorAll("div.qcontainer > div > div.fillinblank-contrainer");
	if (fillinblank_contrainer.length != 0)
		return fillinblank_contrainer;

	const qtext = getQuestionElement();
	if (qtext && qtext.querySelectorAll("p").length != 0)
		return qtext.querySelectorAll("p");

	const sliderquestion = document.querySelectorAll("#d-q-ans-container > div.slider-container > div.item > div.text")
	return sliderquestion;
}

function getAnswerInput() {
	return document.querySelector(`#d-q-ans-container > table.simpletext-tbl > tbody > tr > td.rowcellinput > input[type="text"]`);
}

function getQuestionsChecked() {
	if (!oth_form_data.question_type)
		return null;

	if (getAnswerInput())
		return null;

	let answer_container_div = document.querySelector("#d-q-ans-container > div");

	const answer_variants = [];

	for (let el of answer_container_div.childNodes) {
		if (el.className && el.className.match(/item\s*otp-row-1/)) {
			const label = getChildWhere(
				el,
				(child) =>
					getChildWhere(
						child,
						(child2) =>
							child2.id &&
							child2.id.toLowerCase().match(/t_ans_.*/)
					) &&
					getChildWhere(child, (child2) =>
						isMatchingTagName(child2, "span")
					)
			);

			let marked_indicator_founded = false;

			const indicator_element = getChildWhere(label, (el) =>
				isMatchingTagName(el, "i")
			);
			for (let className of indicator_element.classList)
				if (className.match(/-checked.*/))
					marked_indicator_founded = true;

			if (marked_indicator_founded === false)
				continue;

			const label_span = getChildWhere(label, (el) =>
				isMatchingTagName(el, "span")
			);
			const label_span_p = getChildWhere(label_span, (el) =>
				isMatchingTagName(el, "p")
			);
			if (oth_form_data.question_type === 1)
				return label_span_p.textContent
			else
				answer_variants.push(label_span_p.textContent);
		}
	}

	if (oth_form_data.question_type === 2)
		return answer_variants;
	else
		return null;
}

function getMatchingQuestions() {
	let matching_questions = document.querySelector("#d-q-ans-container > div.matching-div > div.lst1 > ul");

	let result = [];

	for (let el_question of matching_questions.querySelectorAll("li")) {
		result.push(el_question.querySelector("div.main > div.txt > span > p").textContent)
	}

	return result;
}

function getMatchingAnswers() {
	let matching_questions = document.querySelector("#d-q-ans-container > div.matching-div > div.lst2 > ul");

	let result = [];

	for (let el_question of matching_questions.querySelectorAll("li")) {
		result.push(el_question.querySelector("div.main > div.txt > span > p").textContent)
	}

	return result;
}

function getOrderAnswers() {
	const result = [];
	for (const textElement of document.querySelectorAll("#d-q-ans-container > ul.sequencing-ul > li > table > tbody > tr > td > span > p"))
		result.push(textElement.textContent);

	return result
}

function getQuestionVariants() {
	const answer_variants = [];

	if (document.querySelector("#d-q-ans-container > ul.sequencing-ul"))
		return [getOrderAnswers(), 7];
	
	if (document.querySelector("div.qcontainer > div > div.fillinblank-contrainer > p"))
	    return [[], 6];

	if (document.querySelector("#d-q-ans-container > div.matching-div")) {
		return [[getMatchingQuestions(), getMatchingAnswers()], 5];
	}

	if (document.querySelector("#d-q-ans-container > div.slider-container")) {
		const el_slider = document.querySelector("#d-q-ans-container > div.slider-container > div.item > div.ui-slider")

		return [[$(`#${el_slider.id}`).slider("option", "min"), $(`#${el_slider.id}`).slider("option", "max")], 4];
	}

	let answer_container = document.getElementById("d-q-ans-container");
	if (
		getChildWhere(
			answer_container,
			(el) =>
				isMatchingTagName(el, "table") &&
				el.classList.contains("simpletext-tbl")
		) !== null
	)
		return [answer_variants, 3];

	let answer_container_div = getChildWhere(answer_container, (el) =>
		isMatchingTagName(el, "div")
	);
	let question_type = null;


	for (let el of answer_container_div.childNodes) {
		if (el.className && el.className.match(/item\s*otp-row-1/)) {
			const label = getChildWhere(
				el,
				(child) =>
					getChildWhere(
						child,
						(child2) =>
							child2.id &&
							child2.id.toLowerCase().match(/t_ans_.*/)
					) &&
					getChildWhere(child, (child2) =>
						isMatchingTagName(child2, "span")
					)
			);

			if (question_type === null) {
				const indicator_element = getChildWhere(label, (el) =>
					isMatchingTagName(el, "i")
				);
				for (let className of indicator_element.classList) {
					if (className.match(/icon-rb.*/)) question_type = 1;
					if (className.match(/icon-chk.*/)) question_type = 2;
				}
			}
	
			answer_variants.push(label.querySelector("span > p").textContent);
		}
	}

	return [answer_variants, question_type];
}


function getAIAnswerSuccessCallback(data, callback) {
	const error_message =
		data.error &&
		data.error.message &&
		data.error.message &&
		data.error.message.toLowerCase();
	if (error_message) {
		if (error_message.match(/rate limit exceeded.*/)) {
			callback("Достигнут лимит запросов");
		} else if (
			error_message.match(/.*user\s*location\s*is\s*not\s*supported.*/)
		) {
			callback("ВКЛЮЧИ ВПН");
		}
		return;
	}

	try {
		let answer_text =
			// openrouter.ai
			(data.choices &&
				data.choices[0] &&
				data.choices[0].message &&
				data.choices[0].message.content &&
				data.choices[0].message.content.trim()) ?? // google ai
			(data.candidates &&
				data.candidates[0] &&
				data.candidates[0].content &&
				data.candidates[0].content.parts &&
				data.candidates[0].content.parts[0] &&
				data.candidates[0].content.parts[0].text);

		let think_substr_index = answer_text.indexOf("</think>");
		if (think_substr_index !== -1)
			answer_text = answer_text.slice(
				think_substr_index + "</think>".length
			);

		answer_text = answer_text.replace(/\n/g, "").trim();
		callback(answer_text);
	} catch {
		callback("Ошибка");
	}
}

function getAIAnswerErrorCallback(error, callback) {
	if (
		error.error &&
		error.error.message &&
		error.error.message.toLowerCase().match(/rate limit exceeded.*/)
	)
		callback("Достигнут лимит запросов");
	else {
		console.error("Error:", error);
		callback("Ошибка");
	}
}

function getAIAnswerHF(AIModel, content, callback) {
	fetch(AIModel.url ?? "https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: AIModel.api_key ?? `Bearer ${window.sk_api_key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: AIModel.modelName,
			messages: [
				{
					role: "user",
					content: content,
				},
			],
		}),
	})
		.then((response) => {
			return response.json();
		})
		.then((data) => {
			getAIAnswerSuccessCallback(data, callback);
		})
		.catch((error) => {
			getAIAnswerErrorCallback(error, callback);
		});
}

function getAIAnswer_common(AIModel, content, callback) {
	fetch(AIModel.url ?? "https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${AIModel.api_key ?? window.sk_api_key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: AIModel.modelName,
			messages: [
				{
					role: "user",
					content: content,
				},
			],
		}),
	})
		.then((response) => {
			return response.json();
		})
		.then((data) => {
			getAIAnswerSuccessCallback(data, callback);
		})
		.catch((error) => {
			getAIAnswerErrorCallback(error, callback);
		});
}

function getAIAnswer_googleai(AIModel, prompt, callback) {
	const API_KEY = AIModel.api_key;
	const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${AIModel.modelName}:generateContent?key=${API_KEY}`;

	fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			contents: [
				{
					parts: [
						{
							text: prompt,
						},
					],
				},
			],
		}),
	})
		.then((response) => {
			return response.json();
		})
		.then((data) => {
			getAIAnswerSuccessCallback(data, callback);
		})
		.catch((error) => {
			getAIAnswerErrorCallback(error, callback);
		});
}

function getAIAnswer(AIModel, content, callback) {
	switch (AIModel.type) {
		case "googleai":
			getAIAnswer_googleai(AIModel, content, callback);
			break;
		default:
			//case "openrouter":
			getAIAnswer_common(AIModel, content, callback);
			break;
	}
}

const db_types = {
	"supabase": {
		url: "https://drlwwujcacqiwxvyeaqe.supabase.co/rest/v1/",
		tableUrl: "",
		apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybHd3dWpjYWNxaXd4dnllYXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4OTg0OTEsImV4cCI6MjA3NjQ3NDQ5MX0.agyV9myvwwi6SdpBbJQq6-BRl6o8pqy8kkICZpwKCYs",
		isReturningRepresenation: true,
	},
	"render_flask": {
		url: "https://onlinetestpadhelper.onrender.com/dbcontrol/",
		tableUrl: "table/",
	}
}

const db_data = db_types[db_type]
const db = {
	makeRequest: async function(URLSection, method = "GET", body = null) {
		const requestData = {
			method: method,
			headers: {
				"Content-Type": "application/json"
			},
		};

		if (db_data.apikey) {
			requestData.headers.apikey = db_data.apikey
			requestData.headers.Authorization = `Bearer ${db_data.apikey}`
		}


		if (method === "POST") {
			if (db_data.isReturningRepresenation)
				requestData.headers.Prefer = "return=representation";
			requestData.body = JSON.stringify(body);
		}

		const response = await fetch(
			`${db_data.url}${URLSection}`,
			requestData
		);

		return response;
	},
	selectWhere: async function (tableName, conditions) {
		let conditions_new = {};
		Object.entries(conditions).forEach(([key, value]) => {
			value = "" + value;
			if (value !== null && value !== undefined && value !== "")
				conditions_new[key] = (db_type === "supabase" ? `eq.` : "") + encodeURIComponent(value);
		});
		if (conditions_new.length === 0)
			return;
		const condition_string = objectToStringWithSeparator(
			conditions_new,
			"&",
			"="
		);

		return await db.makeRequest(`${db_data.tableUrl}${tableName}?${condition_string}`);
	},
	selectOrCreateOnNoRecord: async function(tableName, matchParams, newParams=null) {
		const response_getRequest = await db.selectWhere(tableName, matchParams);
		const response_getRequest_json = await response_getRequest.json();
		if (response_getRequest_json && response_getRequest_json.length > 0 && response_getRequest.ok)
		{
			return [response_getRequest, response_getRequest_json, false];
		}

		const response_postRequest = await db.insertInto(tableName, newParams ?? {});
		const response_postRequest_json = await response_postRequest.json();
		if (response_postRequest_json && response_postRequest_json.length > 0 && response_postRequest.ok) {
			return [response_postRequest, response_postRequest_json, true];
		}

		return [[], [], false]
	},
	insertInto: async function(tableName, body) {
		return await db.makeRequest(`${db_data.tableUrl}${tableName}`, "POST", body);
	},
	deleteFrom: async function(tableName, conditions) {
		let conditions_new = {};
		Object.entries(conditions).forEach(([key, value]) => {
			conditions_new[key] = db_type === "supabase" ? `eq.` : "" + encodeURIComponent(value);
		});
		const condition_string = objectToStringWithSeparator(
			conditions_new,
			"&",
			"="
		);
		return await db.makeRequest(`${db_data.tableUrl}${tableName}?${condition_string}`, "DELETE");
	},
	callFunction: async function(functionName, body) {
		return await db.makeRequest(`rpc/${functionName}`, "POST", body);
	}
}

function handleFormSubmit() {
	const testform = document.getElementById("testform");
	const submit_button = document.getElementById("btnNext");

	if (!testform)
		return;

	submit_button.onclick = null;
	let handleClick = async (e) => {
		if (!question_types[oth_form_data.question_type].work_with_db)
			return;
		e.preventDefault();

		try {
			const body = {};
			const data = [];
			body.p_user_id = oth_form_data.user_data.id;
			body.p_question_id = oth_form_data.question_data.id;

			let answer_checked, answers_checked, answer_checked_id; // question type - 1
			let answers_checked_ids; // question type - 2
			let inputBox, answer_text; // question type - 3
			let el_slider;
			switch (oth_form_data.question_type) {
				case 1:
					body.p_answer_ids = data
					answer_checked = await getQuestionsChecked();
					answer_checked_id = null;

					for (let answer_variant of oth_form_data.answers_data)
						if (answer_checked === answer_variant.answer) {
							answer_checked_id = answer_variant.id;
							break;
						}

					if (answer_checked_id)
						await data.push(answer_checked_id);
					break;
				case 2:
					body.p_answer_ids = data
					answers_checked =  await getQuestionsChecked();
					answers_checked_ids = [];

					for (let answer_checked of answers_checked)
						for (let answer_variant of oth_form_data.answers_data)
							if (answer_checked === answer_variant.answer)
								await answers_checked_ids.push(answer_variant.id);

					if (answers_checked_ids)
						for (let answer_checked_id of answers_checked_ids)
							await data.push(answer_checked_id);
					break;
				case 3:
					inputBox = getAnswerInput();
					answer_text = inputBox.value;
					body.p_answer_text = answer_text;
					break;
				case 4:
					el_slider = document.querySelector("#d-q-ans-container > div.slider-container > div.item > div.ui-slider")
					body.p_answer_text = $(`#${el_slider.id}`).slider("value").toString();
					break;
			}

			const response = await db.callFunction("record_user_answer", body);

			if (!response.ok) {
				throw new Error(`Ошибка сервера: ${response.status}`);
			}

		} catch (error) {
			console.error("Ошибка при отправке:", error);
		}

		submit_button.removeEventListener("click", handleClick);
		submit_button.click();
		let ret = await OnNavButtonClick(submit_button)
		submit_button.onclick = () => {
			OnNavButtonClick(submit_button)
		};

		return ret;
	}

	submit_button.addEventListener("click", handleClick);
}

async function getUserData() {
	let userId = localStorage.getItem(`oth_id_${db_type}`);

	const body = {};
	let response;

	if (userId !== null)
		body.p_user_id = userId;
	response = await db.callFunction("get_or_create_user", body);


	if (!response.ok)
		return;
	const response_json = (await response.json())[0];
	userId = response_json.id

	if (userId && typeof userId === 'number')
		localStorage.setItem(`oth_id_${db_type}`, userId)

	return response_json
}

function getTestTitle() {
	const span_title = document.querySelector("#testform > div.otp-item-view-page > h1.otp-item-view-title > span")

	if (span_title)
		return span_title.textContent;

	const testResultTitle = document.querySelector("body.item-body > div.otp-item-form > div.otp-item-view-page > h1.otp-item-view-title > span");

	if (testResultTitle)
		return testResultTitle.textContent;
}

async function getTestData() {
	const response = await db.callFunction("get_test", {
		p_test_name: getTestTitle()
	})

	const response_json = await response.json()

	return response_json[0] || {}
}

async function getUserAnswers() {
	let response, response_json;
	let result = [];
	switch (oth_form_data.question_type) {
		case 1:
		case 2:
			response = await db.callFunction("get_answers_count", {
				p_question_id: oth_form_data.question_data.id
			})

			response_json = await response.json()

			await response_json.forEach((answer_data, index, arr) => {

				let answer_text;

				for (let answer2_data of oth_form_data.answers_data) {
					if (answer2_data.id == answer_data.answer_id) {
						answer_text = answer2_data.answer;
						break;
					}
				}



				if (answer_text)
					result.push({
						answer: answer_text,
						answer_count: answer_data.answer_count
					});

			})
		case 3:
		case 4:
			response = await db.callFunction("get_free_answers_count", {
				p_question_id: oth_form_data.question_data.id
			})

			response_json = await response.json()

			await response_json.forEach((answer_data, index, arr) => {

				result.push({
					answer: answer_data.answer_text,
					answer_count: answer_data.answer_count
				});

			})
		default:
			break;
	}
	return result;
}

async function getCorrectAnswer() {
	let response, response_json, correct_answers, correct_answer_id;
	switch (oth_form_data.question_type)
	{
		case 1:
			response = await db.selectWhere("correct_answers", {question_id: oth_form_data.question_data.id})

			response_json = await response.json();

			if (response_json.length === 0)
				return;

			correct_answer_id = response_json[0].answer_id
			for (let answer_data of oth_form_data.answers_data) {
				if (answer_data.id === correct_answer_id)
					return answer_data.answer;
			}
			break;
		case 2:
			response = await db.selectWhere("correct_answers", {question_id: oth_form_data.question_data.id})

			response_json = await response.json();

			if (response_json.length === 0)
				return;

			correct_answers = [];
			for (let correct_answer_data of response_json) {
				let correct_answer_id = correct_answer_data.answer_id
				for (let answer_data of oth_form_data.answers_data) {
					if (answer_data.id === correct_answer_id)
						correct_answers.push(answer_data.answer);
				}
			}
			return correct_answers;
	}
	return;
}

async function getQuestionData() {

	if (!oth_form_data.question_type || !question_types[oth_form_data.question_type] || !question_types[oth_form_data.question_type].work_with_db) {
		oth_form_data.el_answer_text.textContent += " Данный тип вопроса не поддерживается.";
		return;
	}

	const response_get_question_with_answers_body = {
		p_question_text: await Array.from(getQuestionStrings()).map((value, index, array) => value.textContent).join(" ").trim(),
		p_question_type: oth_form_data.question_type,
		p_test_id: oth_form_data.test_data.id
	}

	if (oth_form_data.question_type === 1 || oth_form_data.question_type === 2) {
		response_get_question_with_answers_body.p_answers = 
			oth_form_data.question_variants
			.filter((value, index, array) => value.length != 0);
		if (response_get_question_with_answers_body.p_answers.length == 0)
			return;
	}
		

	const response_get_question_with_answers = await db.callFunction("get_question_with_answers", response_get_question_with_answers_body)

	const data = await response_get_question_with_answers.json();

	if (!data.question)
		oth_form_data.el_answer_text.textContent += " Вопрос не удалось отправить.";

	const createdSomething = data.created_something;

	oth_form_data.question_data = data.question;
	oth_form_data.answers_data = data.answers;
	if (createdSomething === false)
		oth_form_data.el_answer_text.textContent += " Вопрос обнаружен.";
	else
		oth_form_data.el_answer_text.textContent += " Вопрос отправлен на сервер.";

	getCorrectAnswer()
	.then((correct_answer) => {
		if (correct_answer)
			switch (oth_form_data.question_type)
			{
				case 2:
					oth_form_data.el_answer_text.textContent += ` Правильные ответы: ${correct_answer.join("; ")}.`;
					break;
				default:
					oth_form_data.el_answer_text.textContent += ` Правильный ответ: ${correct_answer}.`;
					break;
			}
		else
			oth_form_data.el_answer_text.textContent += ` Правильный ответ не обнаружен.`;
	});

	getUserAnswers()
	.then((user_answers) => {
		if (user_answers)
			for (let answer_data of user_answers) {
				const el_user_answers_text = document.createElement("p");
				el_user_answers_text.textContent = `"${answer_data.answer}" количество ответов: ${answer_data.answer_count}`;
				oth_form_data.el_answer_text.insertAdjacentElement('afterend', el_user_answers_text);
			}
	})

	getBestAnswer()
	.then(async (response) => {
		if (!response.ok) return;

		let bestAnswer = await response.json()
		if (bestAnswer.length == 0) {
			oth_form_data.best_user_answer_element.textContent = "Лучшего ответа не найдено";
			return;
		}
		let answer = await bestAnswer.map((value, index, arr) => value.answer_text).join("; ")
		console.log(bestAnswer, answer)
		oth_form_data.best_user_answer_element.textContent = `Лучший ответ из пользователей - ${bestAnswer[0].best_result}, ответ: ${answer}`;
	})
}

async function getBestAnswer() {
	if (oth_form_data.question_data)
		return await db.callFunction("get_best_answer_by_user_answers", {p_question_id: oth_form_data.question_data.id});
	return null;
}

function createUserOutput() {
	const qtext = getQuestionElement();

	if (qtext === null) return;

	const qtext_div = document.createElement("div")
    qtext.parentElement.prepend(qtext_div);

	const el_answer_text = document.createElement("p");
	qtext_div.appendChild(el_answer_text);
	qtext_div.style.display = "none";

	let el_question_string, question_string, question_variants, question_type;
	try {
		el_question_string = getQuestionStrings();
		question_string = Array.from(el_question_string).map((value, index, array) => value.textContent).join(" ").trim();

		for (let el of el_question_string) {
			el.onselectstart = function() {
				return false;
			};

			el.unselectable = "on";

			el.addEventListener("dblclick", function(e) {
				qtext_div.style.display = (qtext_div.style.display === "block" || qtext_div.style.display === null) ? "none" : "block";
			});
		}

		const getQuestionVariants_result = getQuestionVariants();
		question_variants = getQuestionVariants_result[0]
		question_type = getQuestionVariants_result[1]

		let el_answer_text_textContent = `Вопрос прочитан.`;
		el_answer_text.textContent = el_answer_text_textContent;
	} catch (e) {
		el_answer_text.textContent = "Ошибка";
		console.log("ошибка", e)
		return;
	}

	if (question_types[question_type]) {
		const best_user_answer_text = document.createElement("p");
		el_answer_text.insertAdjacentElement('afterend', best_user_answer_text);

		oth_form_data.best_user_answer_element = best_user_answer_text;
	}

	if (question_types[question_type] && question_types[question_type].getAITextRequest) {
		const testTitle = getTestTitle();
		let testPrefix;
		if (testTitle && testTitle.length != 0)
			testPrefix = ` Заголовок данного теста: ${testTitle}.`
		else
			testPrefix = "";
		const AIRequestText = AIRequestTextCommonStart
			+ testPrefix
			+ question_types[question_type].getAITextRequest(question_string, question_variants);

		
		const AIRequestCopyTextButton = document.createElement("input");
		AIRequestCopyTextButton.value = "Скопировать запрос";
		AIRequestCopyTextButton.type = "button";
		AIRequestCopyTextButton.addEventListener("click", (ev) => {
			copyToClipboard(AIRequestText)
		});


		el_answer_text.insertAdjacentElement('afterend', AIRequestCopyTextButton);

		const isSendingAIRequest = true;
		if (isSendingAIRequest && AIRequestText != "")
			aiModels.forEach((value, index, arr) => {
				const answer_el = document.createElement("p");
				let has_api_key = !!value.api_key;
				answer_el.textContent = `${value.modelNameUser} ответ: ${has_api_key ? "..." : "нет api key"}`;
				el_answer_text.insertAdjacentElement('beforebegin', answer_el);

				value.textElement = answer_el;

				if (has_api_key) {
					getAIAnswer(value, AIRequestText, (answer_text) => {
						value.textElement.textContent = `${value.modelNameUser} ответ: ${answer_text}`;
					});
				}
			});
	}


	oth_form_data.question_type = question_type
	oth_form_data.el_answer_text = el_answer_text
	oth_form_data.question_variants = question_variants

	return true;
}

function getDirectText(element) {
    return Array.from(element.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .join(' {txt} ')
        .trim();
}

function getSkipsText() { 
	const result = {}
	result.text = ""
	result.variants = []
	for (const textElement of document.querySelectorAll("div.qcontainer > div > div.fillinblank-contrainer > p")) {
		result.text = result.text + (result.text ? " " : "") + getDirectText(textElement)
		
		for (let selectElement of textElement.querySelectorAll("select")) {
			result.variants.push([])
			for (let optionElement of selectElement.querySelectorAll("option"))
				if (optionElement.textContent)
					result.variants[result.variants.length-1].push(optionElement.textContent);
		}
	}
	
	
	return result
}

function getTestResult() {
	const resultElement = document.querySelector("#dResults > div > div.content > div > div > div > div > div > div > div > span > div > span");
	if (!resultElement) return;
	let regexpResult = resultElement.textContent.match(/(\d*)%/);
	if (!regexpResult) return;
	return regexpResult[1]
}

async function main_func() {
	if (getTestResult()) {
		const [userData, testData] = await Promise.all([
			getUserData(),
			getTestData()
		])
		if (!userData || !testData)
			return;
		oth_form_data.user_data = userData;
		oth_form_data.test_data = testData;
		db.callFunction("record_user_test_result", {
			p_user_id: oth_form_data.user_data.id,
			p_test_id: oth_form_data.test_data.id,
			p_result: getTestResult()
		})
		return;
	}

	const createUserOutput_result = await createUserOutput();
	if (!createUserOutput_result)
		return;
	oth_form_data.test_data = await getTestData();
	oth_form_data.user_data = await getUserData();
	await getQuestionData();

	handleFormSubmit();
}

(function () {
	"use strict";
	const head_el = document.getElementsByTagName("head")[0];
	const disabler_restriction = document.createElement("meta");
	disabler_restriction.content =
		"default-src 'self'; script-src 'self' 'unsafe-inline'";
	disabler_restriction.httpEquiv = "Content-Security-Policy";
	disabler_restriction.content = "upgrade-insecure-requests";

	head_el.appendChild(disabler_restriction);
	const timeoutId = setTimeout(() => {
		try {
main_func()
} catch (e) {
	alert(e)
}
}, 1000);
})();
